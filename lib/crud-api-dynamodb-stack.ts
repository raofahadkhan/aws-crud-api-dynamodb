import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as glue from "aws-cdk-lib/aws-glue";
import * as athena from "aws-cdk-lib/aws-athena";

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
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Creating s3 bucket for data storage of dynamodb

    const userDataBucket = new s3.Bucket(this, `${service}-${stage}-bucket`, {
      bucketName: `${service}-${stage}-bucket`,
      versioned: true,
    });

    // Created a lambda function to be triggered by Dynamodb streams

    const dynamodbStreamLambda = new lambda.Function(
      this,
      `${service}-${stage}-dynamodb-stream-lambda`,
      {
        functionName: `${service}-${stage}-dynamodb-stream-lambda`,
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "StreamLambda.handler",
        code: lambda.Code.fromAsset("lambda"),
        environment: {
          BUCKET_NAME: userDataBucket.bucketName,
        },
      }
    );

    // Grant Access of s3 bucket to dynamodbStreamLambda

    userDataBucket.grantReadWrite(dynamodbStreamLambda);

    // Created an Event source for Lambda function

    const dynamodbStreamEventSource = new lambdaEventSources.DynamoEventSource(userTable, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 1,
      bisectBatchOnError: true,
      retryAttempts: 10,
    });

    // Assignment of the event source to the lambda function

    dynamodbStreamLambda.addEventSource(dynamodbStreamEventSource);

    // // Create a new IAM role for AWS Glue Crawler
    // const role = new iam.Role(this, "MyCrawlerRole", {
    //   assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
    //   roleName: "my-crawler-role",
    // });
    // role.addManagedPolicy(
    //   iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSGlueServiceRole")
    // );

    // // Create a new Glue Crawler
    // const crawler = new glue.CfnCrawler(this, "MyCrawler", {
    //   name: "my_crawler",
    //   role: role.roleArn,
    //   databaseName: "my_database",
    //   targets: {
    //     s3Targets: [
    //       {
    //         path: `s3://${userDataBucket.bucketName}/`,
    //         exclusions: [],
    //       },
    //     ],
    //   },
    // });

    // // Creating a new Athena data catalog

    // const dataCatalog = new athena.CfnDataCatalog(this, "MyDataCatalog", {
    //   name: "my_data_catalog",
    //   type: "GLUE",
    //   description: "My data catalog for Athena",
    //   parameters: {
    //     "catalog-id": "961322954791", // Replace with your AWS account ID
    //   },
    // });

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
