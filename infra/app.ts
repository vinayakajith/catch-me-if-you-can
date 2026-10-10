import { App, Tags } from 'aws-cdk-lib';
import { GameStack } from './game-stack.ts';
const app = new App();
new GameStack(app, 'CatchMeIfYouCan', { env: { region: process.env.CDK_DEFAULT_REGION || 'ap-south-1', account: process.env.CDK_DEFAULT_ACCOUNT } });
Tags.of(app).add('Application', 'Catch Me If You Can');
