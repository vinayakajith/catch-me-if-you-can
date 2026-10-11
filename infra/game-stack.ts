import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Stack, Duration, RemovalPolicy, CfnParameter, CfnOutput, CfnCondition, Aws, Fn, Token, type StackProps,
  aws_s3 as s3, aws_dynamodb as dynamo, aws_lambda as lambda, aws_lambda_event_sources as sources,
  aws_sqs as sqs, aws_secretsmanager as secrets, aws_iam as iam, aws_logs as logs,
  aws_apigatewayv2 as gateway, aws_apigatewayv2_integrations as integrations, aws_apigateway as restGateway,
  aws_cloudfront as cloudfront, aws_cloudfront_origins as origins, aws_certificatemanager as acm,
  aws_s3_deployment as deployment, aws_events as events, aws_events_targets as targets, aws_cloudwatch as watch,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface GameStackProps extends StackProps { artifactRoot?: string; webRoot?: string }
export class GameStack extends Stack {
  constructor(scope: Construct, id: string, props: GameStackProps = {}) {
    super(scope, id, props);
    const artifacts = props.artifactRoot ?? resolve('artifacts/aws'), webRoot = props.webRoot ?? resolve('apps/web/dist');
    const domain = new CfnParameter(this, 'DomainName', { type: 'String', description: 'Public game hostname, without https://. Configure DNS after deployment.', allowedPattern: '^[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}$' });
    const certificateArn = new CfnParameter(this, 'CertificateArn', { type: 'String', description: 'Issued ACM certificate in us-east-1 covering DomainName.', allowedPattern: '^arn:aws:acm:us-east-1:[0-9]{12}:certificate/.+$' });
    const imageEnabled = new CfnParameter(this, 'ImageEnabled', { type: 'String', default: 'false', allowedValues: ['false', 'true'], description: 'Enable only after a fresh production key and image budget are explicitly approved.' });
    const imageBudget = new CfnParameter(this, 'ImageBudgetMicros', { type: 'Number', default: 0, minValue: 0, maxValue: 1000000000, description: 'Lifetime production allowance in microdollars ($1 = 1000000). No automatic resets.' });
    const concurrencyMode = new CfnParameter(this, 'ConcurrencyMode', { type: 'String', default: 'reserved', allowedValues: ['shared', 'reserved'], description: 'Use shared for an initial launch within a new account quota; reserved requires at least 123 available executions before first deployment.' });
    const reserveCapacity = new CfnCondition(this, 'ReserveCapacity', { expression: Fn.conditionEquals(concurrencyMode.valueAsString, 'reserved') });
    const capacity = (reserved: number, shared: number | string) => Token.asNumber(Fn.conditionIf(reserveCapacity.logicalId, reserved, shared));
    const publicOrigin = Fn.join('', ['https://', domain.valueAsString]);
    const table = new dynamo.Table(this, 'State', { partitionKey: { name: 'pk', type: dynamo.AttributeType.STRING }, sortKey: { name: 'sk', type: dynamo.AttributeType.STRING }, billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      encryption: dynamo.TableEncryption.AWS_MANAGED, stream: dynamo.StreamViewType.NEW_IMAGE, timeToLiveAttribute: 'ttl', deletionProtection: true, removalPolicy: RemovalPolicy.RETAIN });
    table.addGlobalSecondaryIndex({ indexName: 'cleanup', partitionKey: { name: 'gcKind', type: dynamo.AttributeType.STRING }, sortKey: { name: 'gcAt', type: dynamo.AttributeType.NUMBER }, projectionType: dynamo.ProjectionType.ALL });
    const web = new s3.Bucket(this, 'Website', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, versioned: true, removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }] });
    const assets = new s3.Bucket(this, 'PrivateImages', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, removalPolicy: RemovalPolicy.RETAIN,
      cors: [{ allowedOrigins: [publicOrigin], allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD, s3.HttpMethods.POST], allowedHeaders: ['*'], exposedHeaders: ['ETag'], maxAge: 300 }],
      // Application cleanup runs every minute. This bounds orphan retention if
      // a write succeeds before its job/room transaction or cleanup is down.
      lifecycleRules: [{ expiration: Duration.days(3), abortIncompleteMultipartUploadAfter: Duration.days(1) }] });
    const key = new secrets.Secret(this, 'OpenAIKey', { description: 'Fresh production OpenAI key for Catch Me If You Can. Replace the disabled placeholder only after approval.', generateSecretString: { secretStringTemplate: '{"disabled":true}', generateStringKey: 'placeholder', passwordLength: 32 }, removalPolicy: RemovalPolicy.RETAIN });
    const originKey = new secrets.Secret(this, 'OriginSecret', { description: 'CloudFront to API origin authentication. Not an OpenAI key.', generateSecretString: { passwordLength: 48, excludePunctuation: true } });
    const dead = new sqs.Queue(this, 'ImageDeadLetters', { encryption: sqs.QueueEncryption.SQS_MANAGED, retentionPeriod: Duration.days(14), enforceSSL: true });
    const queue = new sqs.Queue(this, 'ImageQueue', { encryption: sqs.QueueEncryption.SQS_MANAGED, visibilityTimeout: Duration.seconds(1800), retentionPeriod: Duration.days(1), deadLetterQueue: { queue: dead, maxReceiveCount: 3 }, enforceSSL: true });
    const layer = new lambda.LayerVersion(this, 'ImageLibraries', { code: lambda.Code.fromAsset(`${artifacts}/layer`), compatibleRuntimes: [lambda.Runtime.NODEJS_24_X], compatibleArchitectures: [lambda.Architecture.X86_64], description: 'Pinned Linux x86_64 Sharp image processing binaries' });
    const environment = { FH_TABLE: table.tableName, FH_ASSET_BUCKET: assets.bucketName, FH_QUEUE_URL: queue.queueUrl, FH_IMAGE_ENABLED: imageEnabled.valueAsString, FH_IMAGE_BUDGET_MICROS: imageBudget.valueAsString,
      FATHER_HUNTER_PUBLIC_ORIGIN: publicOrigin, FATHER_HUNTER_IMAGE_MODEL: 'gpt-image-2.5-sunburst-2026-09-08', FATHER_HUNTER_IMAGE_QUALITY: 'high' };
    const fn = (name: string, handler: string, timeout: number, memorySize: number, extra: Record<string, string> = {}) => {
      const logGroup = new logs.LogGroup(this, `${name}Logs`, { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY });
      return new lambda.Function(this, name, { runtime: lambda.Runtime.NODEJS_24_X, architecture: lambda.Architecture.X86_64, code: lambda.Code.fromAsset(`${artifacts}/functions`), layers: [layer], handler, timeout: Duration.seconds(timeout), memorySize, environment: { ...environment, ...extra }, logGroup, tracing: lambda.Tracing.DISABLED });
    };
    // Dynamic references resolve during deployment; synthesized templates never
    // contain this value. The API cannot read the OpenAI secret at runtime.
    const api = fn('Api', 'api.handler', 28, 1024, { FH_ORIGIN_SECRET: originKey.secretValue.unsafeUnwrap() });
    const worker = fn('ImageWorker', 'workers.imageHandler', 300, 2048, { FH_OPENAI_SECRET_ARN: key.secretArn });
    const dispatcher = fn('Dispatcher', 'workers.dispatchHandler', 30, 256);
    const cleanup = fn('Cleanup', 'workers.cleanupHandler', 120, 1024);
    const realtime = new lambda.Function(this, 'Realtime', { runtime: lambda.Runtime.NODEJS_24_X, architecture: lambda.Architecture.X86_64,
      code: lambda.Code.fromAsset(`${artifacts}/functions`), handler: 'realtime.handler', timeout: Duration.seconds(10), memorySize: 512,
      environment: { FH_TABLE: table.tableName, FATHER_HUNTER_PUBLIC_ORIGIN: publicOrigin },
      logGroup: new logs.LogGroup(this, 'RealtimeLogs', { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }) });
    realtime.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:ConditionCheckItem'], resources: [table.tableArn], conditions: { 'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['ROOM#*', 'TICKET#*', 'SOCKET#*', 'SOCKETS#*', 'LIMIT#*'] } } }));
    const sockets = new gateway.WebSocketApi(this, 'Sockets', { apiName: 'Catch Me If You Can Live',
      connectRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('Connect', realtime) },
      disconnectRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('Disconnect', realtime) },
      defaultRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('Message', realtime) } });
    const socketStage = new gateway.WebSocketStage(this, 'SocketStage', { webSocketApi: sockets, stageName: 'live', autoDeploy: true });
    const rawSocketStage = socketStage.node.defaultChild as gateway.CfnStage;
    rawSocketStage.defaultRouteSettings = { throttlingRateLimit: 100, throttlingBurstLimit: 50, dataTraceEnabled: false, loggingLevel: 'OFF' };
    sockets.grantManageConnections(realtime);
    api.addEnvironment('FH_SOCKET_ENDPOINT', socketStage.url);
    // Omit reservations in shared mode: new accounts may have only 10 slots,
    // while any positive reservation requires 100 additional unreserved slots.
    (worker.node.defaultChild as lambda.CfnFunction).reservedConcurrentExecutions = capacity(2, Aws.NO_VALUE);
    (api.node.defaultChild as lambda.CfnFunction).reservedConcurrentExecutions = capacity(20, Aws.NO_VALUE);
    (cleanup.node.defaultChild as lambda.CfnFunction).reservedConcurrentExecutions = capacity(1, Aws.NO_VALUE);
    for (const service of [api, worker, cleanup]) {
      service.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:ConditionCheckItem'], resources: [table.tableArn, `${table.tableArn}/index/*`] }));
      service.addToRolePolicy(new iam.PolicyStatement({ actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], resources: [assets.arnForObjects('*')] }));
      service.addToRolePolicy(new iam.PolicyStatement({ actions: ['s3:ListBucket'], resources: [assets.bucketArn] }));
    }
    // No Scan permission; every lookup, rate limit and cleanup uses a key/index.
    dispatcher.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:DeleteItem'], resources: [table.tableArn], conditions: { 'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['OUTBOX#*'] } } }));
    key.grantRead(worker); queue.grantSendMessages(dispatcher); queue.grantSendMessages(cleanup);
    worker.addEventSource(new sources.SqsEventSource(queue, { batchSize: 1, maxConcurrency: 2, reportBatchItemFailures: true }));
    dispatcher.addEventSource(new sources.DynamoEventSource(table, { startingPosition: lambda.StartingPosition.TRIM_HORIZON, batchSize: 10, retryAttempts: 3, bisectBatchOnError: true, reportBatchItemFailures: true,
      filters: [lambda.FilterCriteria.filter({ eventName: ['INSERT'], dynamodb: { NewImage: { gcKind: { S: ['OUTBOX'] } } } })] }));
    new events.Rule(this, 'CleanupSchedule', { schedule: events.Schedule.rate(Duration.minutes(1)), targets: [new targets.LambdaFunction(cleanup, { retryAttempts: 2 })] });
    const http = new gateway.HttpApi(this, 'Http', { apiName: 'Catch Me If You Can', createDefaultStage: false, defaultIntegration: new integrations.HttpLambdaIntegration('Proxy', api) });
    const accessLogs = new logs.LogGroup(this, 'HttpLogs', { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY });
    const stage = new gateway.HttpStage(this, 'HttpStage', { httpApi: http, stageName: '$default', autoDeploy: true, throttle: { rateLimit: capacity(100, 60), burstLimit: capacity(200, 10) }, accessLogSettings: { destination: new gateway.LogGroupLogDestination(accessLogs), format: restGateway.AccessLogFormat.custom(JSON.stringify({ requestId: '$context.requestId', status: '$context.status', route: '$context.routeKey', latency: '$context.responseLatency' })) } });
    const requestPolicy = new cloudfront.OriginRequestPolicy(this, 'GameRequests', { cookieBehavior: cloudfront.OriginRequestCookieBehavior.allowList('fh-owner'), queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(), headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('Origin', 'Content-Type', 'Idempotency-Key', 'X-FH-Request', 'CloudFront-Viewer-Address') });
    const security = new cloudfront.ResponseHeadersPolicy(this, 'BrowserSecurity', { securityHeadersBehavior: {
      contentTypeOptions: { override: true }, frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true }, referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true }, strictTransportSecurity: { accessControlMaxAge: Duration.days(365), override: true },
      contentSecurityPolicy: { override: true, contentSecurityPolicy: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://${assets.bucketRegionalDomainName}; connect-src 'self' https://${assets.bucketRegionalDomainName} ${socketStage.url}; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` },
    } });
    const router = new cloudfront.Function(this, 'Routes', { runtime: cloudfront.FunctionRuntime.JS_2_0, code: cloudfront.FunctionCode.fromInline(readFileSync(new URL('./routes.js', import.meta.url), 'utf8')) });
    const distribution = new cloudfront.Distribution(this, 'WebsiteCdn', { comment: 'Catch Me If You Can', domainNames: [domain.valueAsString], certificate: acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn.valueAsString), minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021, defaultRootObject: 'index.html',
      defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(web), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, responseHeadersPolicy: security, functionAssociations: [{ function: router, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }], compress: true },
      additionalBehaviors: {
        'assets/*': { origin: origins.S3BucketOrigin.withOriginAccessControl(web), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, responseHeadersPolicy: security, compress: true },
        'api/*': { origin: new origins.HttpOrigin(Fn.select(2, Fn.split('/', http.apiEndpoint)), { customHeaders: { 'X-FH-Origin': originKey.secretValue.unsafeUnwrap() }, protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY, allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL, cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, originRequestPolicy: requestPolicy, responseHeadersPolicy: security, compress: true },
      },
    });
    const files = new deployment.BucketDeployment(this, 'PublishFiles', { sources: [deployment.Source.asset(webRoot)], destinationBucket: web, prune: false, cacheControl: [deployment.CacheControl.maxAge(Duration.minutes(5))], memoryLimit: 512 });
    const html = new deployment.BucketDeployment(this, 'PublishHtml', { sources: [deployment.Source.data('index.html', readFileSync(`${webRoot}/index.html`, 'utf8'))], destinationBucket: web, prune: false, cacheControl: [deployment.CacheControl.noStore()], distribution, distributionPaths: ['/index.html'], memoryLimit: 256 });
    html.node.addDependency(files);
    // A handled HTTP 500 or SQS partial failure is a successful Lambda invocation.
    // Observe the HTTP result and redacted worker events as well as Lambda errors.
    const imageFailures = new logs.MetricFilter(this, 'ImageFailureMetric', { logGroup: worker.logGroup, metricNamespace: 'CatchMeIfYouCan', metricName: `${this.stackName}-ImageFailures`, metricValue: '1', filterPattern: logs.FilterPattern.any(logs.FilterPattern.stringValue('$.event', '=', 'image_job_failed'), logs.FilterPattern.stringValue('$.event', '=', 'image_worker_retry')) });
    const httpThrottles = new logs.MetricFilter(this, 'HttpThrottleMetric', { logGroup: accessLogs, metricNamespace: 'CatchMeIfYouCan', metricName: `${this.stackName}-HttpThrottles`, metricValue: '1', filterPattern: logs.FilterPattern.stringValue('$.status', '=', '429') });
    const alarms = [
      new watch.Alarm(this, 'ApiErrors', { metric: stage.metricServerError({ period: Duration.minutes(1) }), threshold: 5, evaluationPeriods: 2 }),
      new watch.Alarm(this, 'RealtimeThrottles', { metric: realtime.metricThrottles({ period: Duration.minutes(1) }), threshold: 1, evaluationPeriods: 2 }),
      new watch.Alarm(this, 'RealtimeErrors', { metric: realtime.metricErrors({ period: Duration.minutes(1) }), threshold: 1, evaluationPeriods: 2 }),
      new watch.Alarm(this, 'ApiThrottles', { metric: api.metricThrottles({ period: Duration.minutes(1) }), threshold: 1, evaluationPeriods: 2 }),
      new watch.Alarm(this, 'HttpThrottles', { metric: httpThrottles.metric({ statistic: 'Sum', period: Duration.minutes(1) }), threshold: 1, evaluationPeriods: 2 }),
      new watch.Alarm(this, 'ImageFailures', { metric: imageFailures.metric({ statistic: 'Sum', period: Duration.minutes(1) }), threshold: 1, evaluationPeriods: 1 }),
      new watch.Alarm(this, 'ImageCrashes', { metric: worker.metricErrors({ period: Duration.minutes(1) }), threshold: 1, evaluationPeriods: 1 }),
      new watch.Alarm(this, 'ImageBacklog', { metric: queue.metricApproximateAgeOfOldestMessage({ period: Duration.minutes(1) }), threshold: 600, evaluationPeriods: 2 }),
      new watch.Alarm(this, 'DeadLetters', { metric: dead.metricApproximateNumberOfMessagesVisible(), threshold: 1, evaluationPeriods: 1 }),
      new watch.Alarm(this, 'CleanupErrors', { metric: cleanup.metricErrors({ period: Duration.minutes(1) }), threshold: 1, evaluationPeriods: 2 }),
    ];
    for (const alarm of alarms) (alarm.node.defaultChild as watch.CfnAlarm).treatMissingData = 'notBreaching';
    const dashboard = new watch.Dashboard(this, 'Operations');
    dashboard.addWidgets(new watch.AlarmStatusWidget({ title: 'Catch Me If You Can', alarms }), new watch.GraphWidget({ title: 'API requests and latency', left: [api.metricInvocations()], right: [api.metricDuration({ statistic: 'p95' })] }), new watch.GraphWidget({ title: 'Image queue', left: [queue.metricApproximateNumberOfMessagesVisible(), dead.metricApproximateNumberOfMessagesVisible()] }));
    new CfnOutput(this, 'GameUrl', { value: publicOrigin }); new CfnOutput(this, 'CloudFrontDomain', { value: distribution.distributionDomainName }); new CfnOutput(this, 'CloudFrontId', { value: distribution.distributionId });
    new CfnOutput(this, 'RealtimeUrl', { value: socketStage.url });
    new CfnOutput(this, 'StateTable', { value: table.tableName }); new CfnOutput(this, 'WebsiteBucket', { value: web.bucketName }); new CfnOutput(this, 'PrivateImageBucket', { value: assets.bucketName });
    new CfnOutput(this, 'OpenAISecretArn', { value: key.secretArn }); new CfnOutput(this, 'DashboardName', { value: dashboard.dashboardName });
  }
}
