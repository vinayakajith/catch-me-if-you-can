import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { GameStack } from '../game-stack.ts';

test('serverless infrastructure starts with private storage, isolated secrets and images disabled', () => {
  const root = mkdtempSync(join(tmpdir(), 'catch-infra-'));
  try {
    for (const folder of ['functions', 'layer', 'web']) mkdirSync(`${root}/${folder}`);
    writeFileSync(`${root}/functions/api.cjs`, 'exports.handler = async () => ({statusCode:200});');
    writeFileSync(`${root}/layer/fixture`, 'test'); writeFileSync(`${root}/web/index.html`, '<div>Fixture</div>');
    const app = new App({ outdir: `${root}/assembly` });
    const stack = new GameStack(app, 'TestGame', { artifactRoot: root, webRoot: `${root}/web`, env: { account: '123456789012', region: 'ap-south-1' } });
    const template = Template.fromStack(stack), data = template.toJSON(); app.synth();
    assert.equal(data.Parameters.ImageEnabled.Default, 'false'); assert.equal(data.Parameters.ImageBudgetMicros.Default, 0);
    assert.deepEqual(data.Parameters.ConcurrencyMode.AllowedValues, ['shared', 'reserved']);
    assert.equal(data.Parameters.ConcurrencyMode.Default, 'reserved', 'Existing deployments retain their function caps unless shared mode is explicitly selected');
    assert.deepEqual(data.Conditions.ReserveCapacity, { 'Fn::Equals': [{ Ref: 'ConcurrencyMode' }, 'reserved'] });
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', { BillingMode: 'PAY_PER_REQUEST', TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true }, StreamSpecification: { StreamViewType: 'NEW_IMAGE' }, DeletionProtectionEnabled: true });
    for (const bucket of Object.values(template.findResources('AWS::S3::Bucket')) as any[]) assert.deepEqual(bucket.Properties.PublicAccessBlockConfiguration, { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true });
    template.hasResourceProperties('AWS::S3::Bucket', { LifecycleConfiguration: { Rules: Match.arrayWith([Match.objectLike({ ExpirationInDays: 3 })]) }, CorsConfiguration: { CorsRules: Match.arrayWith([Match.objectLike({ AllowedMethods: ['GET', 'HEAD', 'POST'], AllowedOrigins: [Match.anyValue()] })]) } });
    template.hasResourceProperties('AWS::SQS::Queue', { VisibilityTimeout: 1800, RedrivePolicy: { maxReceiveCount: 3, deadLetterTargetArn: Match.anyValue() } });
    template.hasResourceProperties('AWS::Lambda::Function', { Handler: 'workers.imageHandler', Timeout: 300, Runtime: 'nodejs24.x', Architectures: ['x86_64'] });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', { BatchSize: 1, FunctionResponseTypes: ['ReportBatchItemFailures'], ScalingConfig: { MaximumConcurrency: 2 } });
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', { DefaultRouteSettings: {
      ThrottlingBurstLimit: { 'Fn::If': ['ReserveCapacity', 200, 10] },
      ThrottlingRateLimit: { 'Fn::If': ['ReserveCapacity', 100, 60] },
    } });
    template.resourceCountIs('AWS::Logs::MetricFilter', 2);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', { Namespace: 'AWS/ApiGateway', MetricName: '5xx' });
    const functions = template.findResources('AWS::Lambda::Function') as Record<string, any>;
    const reservedCaps: Record<string, number> = { 'api.handler': 20, 'workers.imageHandler': 2, 'workers.cleanupHandler': 1 };
    for (const fn of Object.values(functions)) {
      const cap = reservedCaps[fn.Properties.Handler];
      assert.deepEqual(fn.Properties.ReservedConcurrentExecutions, cap === undefined ? undefined : { 'Fn::If': ['ReserveCapacity', cap, { Ref: 'AWS::NoValue' }] }, 'Shared mode must remove every reservation, including deployment helpers');
    }
    const api = Object.values(functions).find(r => r.Properties.Handler === 'api.handler');
    assert.equal(api.Properties.Environment.Variables.FH_OPENAI_SECRET_ARN, undefined);
    assert.match(JSON.stringify(api.Properties.Environment.Variables.FH_ORIGIN_SECRET), /resolve:secretsmanager/);
    const policies = template.findResources('AWS::IAM::Policy') as Record<string, any>;
    const keyReaders = Object.entries(policies).filter(([, r]) => JSON.stringify(r).includes('secretsmanager:GetSecretValue'));
    assert.equal(keyReaders.length, 1); assert.match(keyReaders[0][0], /ImageWorker/);
    assert.ok(!JSON.stringify(policies).includes('dynamodb:Scan'));
    const distribution = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0] as any;
    assert.equal(distribution.Properties.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy, 'redirect-to-https');
    const apiBehavior = distribution.Properties.DistributionConfig.CacheBehaviors.find((b: any) => b.PathPattern === 'api/*');
    assert.equal(apiBehavior.AllowedMethods.length, 7); assert.equal(apiBehavior.FunctionAssociations, undefined, 'API errors must never turn into index.html');
    assert.ok(!JSON.stringify(data.Outputs).includes('FH_ORIGIN_SECRET'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('edge route rewriting refreshes real invite links without swallowing API or missing assets', () => {
  const context = vm.createContext({}); vm.runInContext(readFileSync(new URL('../routes.js', import.meta.url), 'utf8'), context);
  const route = (uri: string) => context.handler({ request: { uri, querystring: { from: { value: 'same-room' } } } });
  for (const path of ['/', '/create', '/r/aaaabbbb-1111-4444-8888-abcdefabcdef']) assert.equal(route(path).uri, '/index.html');
  for (const path of ['/api/rooms/missing', '/assets/missing.png', '/r/not-a-room']) assert.equal(route(path).uri, path);
  assert.equal(route('/create').querystring.from.value, 'same-room');
});
