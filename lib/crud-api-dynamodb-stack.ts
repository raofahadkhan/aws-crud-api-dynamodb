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
      removalPolicy: cdk.RemovalPolicy.RETAIN,
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

    // Created lambda function for Post User Data to dynamo

    const postLambda = new lambda.Function(this, `${service}-${stage}-post-lambda`, {
      functionName: `${service}-${stage}-post-lambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "CreateUser.handler",
      environment: {
        TABLE_NAME: userTable.tableName,
      },
    });

    // Created lambda function for Get User Data to dynamo

    const getLambda = new lambda.Function(this, `${service}-${stage}-get-lambda`, {
      functionName: `${service}-${stage}-get-lambda`,
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "GetUser.handler",
      environment: {
        TABLE_NAME: userTable.tableName,
      },
    });

    // Created lambda function for Update User Address to dynamo

    const updateAddressLambda = new lambda.Function(
      this,
      `${service}-${stage}-update-address-lambda`,
      {
        functionName: `${service}-${stage}-update-address-lambda`,
        runtime: lambda.Runtime.NODEJS_18_X,
        code: lambda.Code.fromAsset("lambda"),
        handler: "UpdateAddress.handler",
        environment: {
          TABLE_NAME: userTable.tableName,
        },
      }
    );

    // Created Post User lambda function integration with api

    const postLambdaIntegration = new apigwv2_integrations.HttpLambdaIntegration(
      `${service}-${stage}-post-lambda-integration`,
      postLambda
    );

    // Created Get User lambda function integration with api

    const getLambdaIntegration = new apigwv2_integrations.HttpLambdaIntegration(
      `${service}-${stage}-get-lambda-integration`,
      getLambda
    );

    // Created Update User Address lambda function integration with api

    const updateAddressLambdaIntegration = new apigwv2_integrations.HttpLambdaIntegration(
      `${service}-${stage}-update-address-lambda-integration`,
      updateAddressLambda
    );

    // Created Route for Post Lambda function

    crudUserApi.addRoutes({
      path: "/create-user",
      methods: [apigwv2.HttpMethod.POST],
      integration: postLambdaIntegration,
    });

    // Created Route for Get Lambda function

    crudUserApi.addRoutes({
      path: "/get-user",
      methods: [apigwv2.HttpMethod.POST],
      integration: getLambdaIntegration,
    });

    // Created Route for Update User Address Lambda function

    crudUserApi.addRoutes({
      path: "/update-address",
      methods: [apigwv2.HttpMethod.PUT],
      integration: updateAddressLambdaIntegration,
    });

    // Grant Full Access Of Dynamo to lambda Functions

    userTable.grantFullAccess(postLambda);
    userTable.grantFullAccess(getLambda);
    userTable.grantFullAccess(updateAddressLambda);
  }
}
