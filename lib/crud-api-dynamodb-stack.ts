import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as lambda from "aws-cdk-lib/aws-lambda";

export class CrudApiDynamodbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const { service, stage } = props?.tags!;

    // Created DynamoDB Table for users Data

    const userTable = new dynamodb.Table(this, `${service}-${stage}-user-table`, {
      tableName: `${service}-${stage}-user-table`,
      partitionKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Created Http Api for Crud Operation of DynamoDB

    const crudUserApi = new apigwv2.HttpApi(this, `${service}-${stage}`, {
      apiName: `${service}-${stage}`,
      description: "This api is responsible for crud operation of user table of dynamodb",
      corsPreflight: {
        allowHeaders: ["Content-Type"],
        allowMethods: [apigwv2.CorsHttpMethod.POST],
        allowCredentials: false,
        allowOrigins: ["*"],
      },
    });

    // Created lambda function for Post Data to dynamo

    const postLambda = new lambda.Function(this, `${service}-${stage}-post-lambda`, {
      functionName: `${service}-${stage}-post-lambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "CreateUser.handler",
      environment: {
        TABLE_NAME: userTable.tableName,
      },
    });

    // Created Post lambda function integration with api

    const postLambdaIntegration = new apigwv2_integrations.HttpLambdaIntegration(
      `${service}-${stage}-post-lambda-integration`,
      postLambda
    );

    // Created Route for Post Lambda function

    crudUserApi.addRoutes({
      path: "/create-user",
      methods: [apigwv2.HttpMethod.POST],
      integration: postLambdaIntegration,
    });

    // Grant Full Access Of Dynamo to lambda Functions

    userTable.grantFullAccess(postLambda);
  }
}
