import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CrudApiDynamodbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const { service, stage } = props?.tags!;

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'CrudApiDynamodbQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
