import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as athena from "aws-cdk-lib/aws-athena";
import * as glue from "aws-cdk-lib/aws-glue";

export class CrudApiDynamodbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const { service, stage } = props?.tags!;

    // ===============================================================================
    // DYNAMODB: CREATED DYNAMODB TABLE FOR USERS
    // ===============================================================================

    const userTable = new dynamodb.Table(
      this,
      `${service}-${stage}-user-table`,
      {
        tableName: `${service}-${stage}-user-table`,
        partitionKey: {
          name: "user_id",
          type: dynamodb.AttributeType.STRING,
        },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      }
    );

    // ===============================================================================
    // S3: CREATED S3 BUCKET FOR DATA STORAGE OF DYNAMODB
    // ===============================================================================

    const userDataBucket = new s3.Bucket(this, `${service}-${stage}-bucket`, {
      bucketName: `${service}-${stage}-bucket`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ===============================================================================
    // LAMBDA: CREATED A LAMBDA FUNCTION TRIGGERD BY DYNAMODB STREAMS
    // ===============================================================================

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

    // ===============================================================================
    // CREATED A DYNAMODB STREAM EVENT SOURCE WHICH WILL TRIGGER THE LAMBDA
    // ===============================================================================

    const dynamodbStreamEventSource = new lambdaEventSources.DynamoEventSource(
      userTable,
      {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 1,
        bisectBatchOnError: true,
        retryAttempts: 10,
      }
    );

    dynamodbStreamLambda.addEventSource(dynamodbStreamEventSource);

    // ===============================================================================
    // IAM: Created IAM POLICIES FOR GLUE AND ATHENA
    // ===============================================================================

    const glueRole = new iam.Role(this, `${service}-${stage}-glue-role`, {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      description: "Role for AWS Glue to access S3 and Glue services",
      inlinePolicies: {
        GlueS3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
              ],
              resources: [
                `${userDataBucket.bucketArn}/*`,
                userDataBucket.bucketArn,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                "glue:Get*",
                "glue:Put*",
                "glue:Create*",
                "glue:Update*",
                "glue:Delete*",
                "glue:BatchCreatePartition",
                "glue:BatchGetPartition",
              ],
              resources: ["*"],
            }),
          ],
        }),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSGlueServiceRole"
        ),
      ],
    });

    const athenaRole = new iam.Role(this, `${service}-${stage}-athena-role`, {
      assumedBy: new iam.ServicePrincipal("athena.amazonaws.com"),
      description: "Role for Athena to access specific S3 bucket",
      inlinePolicies: {
        AthenaS3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
              resources: [
                `${userDataBucket.bucketArn}/*`,
                userDataBucket.bucketArn,
              ],
            }),
          ],
        }),
      },
    });

    // ===============================================================================
    // GLUE: CREATED A DATABASE IN GLUE
    // ===============================================================================

    const glueDatabase = new glue.CfnDatabase(
      this,
      `${service}-${stage}-glue-database`,
      {
        catalogId: cdk.Aws.ACCOUNT_ID,
        databaseInput: {
          name: `${service}-${stage}-glue-database`,
        },
      }
    );

    // ===============================================================================
    // GLUE: CREATED A GLUE CRAWLER
    // ===============================================================================

    new glue.CfnCrawler(this, `${service}-${stage}-glue-crawler`, {
      role: glueRole.roleArn,
      databaseName: glueDatabase.ref,
      targets: {
        s3Targets: [
          {
            path: `s3://${userDataBucket.bucketName}/data-lake/`,
          },
        ],
      },
      schedule: {
        scheduleExpression: "cron(0 0 * * ? *)", // Every day at midnight UTC
        // scheduleExpression: "cron(*/5 * * * ? *)", // Every 5 minutes
      },
    });

    // ===============================================================================
    // ATHENA: CREATE A WORK GROUP IN ATHENA
    // ===============================================================================

    new athena.CfnWorkGroup(this, `${service}-${stage}-athena-work-group`, {
      name: `${service}-${stage}-athena-work-group`,
      recursiveDeleteOption: false, // Set to true if you want query results to be deleted when the workgroup is deleted
      state: "ENABLED",
      description:
        "This work group is responsible for querying users data from athena",
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        resultConfiguration: {
          outputLocation: `s3://${userDataBucket.bucketName}/athena-query-results/`,
          expectedBucketOwner: cdk.Aws.ACCOUNT_ID,
        },
        publishCloudWatchMetricsEnabled: true,
      },
    });

    // ===============================================================================
    // APIGATEWAY: CREATED HTTP API FOR CRUD OPERATION ON USERS TABLE
    // ===============================================================================

    const crudUserApi = new apigwv2.HttpApi(this, `${service}-${stage}`, {
      apiName: `${service}-${stage}`,
      description:
        "This api is responsible for crud operation of user table of dynamodb",
      corsPreflight: {
        allowHeaders: ["Content-Type"],
        allowMethods: [apigwv2.CorsHttpMethod.POST],
        allowCredentials: false,
        allowOrigins: ["*"],
      },
    });

    // ===============================================================================
    // LAMBDA: CREATED LAMBDA FUNCTIONS FOR CRUD OPERATION
    // ===============================================================================

    const postLambda = new lambda.Function(
      this,
      `${service}-${stage}-post-lambda`,
      {
        functionName: `${service}-${stage}-post-lambda`,
        runtime: lambda.Runtime.NODEJS_18_X,
        code: lambda.Code.fromAsset("lambda"),
        handler: "CreateUser.handler",
        environment: {
          TABLE_NAME: userTable.tableName,
        },
      }
    );

    const getLambda = new lambda.Function(
      this,
      `${service}-${stage}-get-lambda`,
      {
        functionName: `${service}-${stage}-get-lambda`,
        runtime: lambda.Runtime.NODEJS_18_X,
        code: lambda.Code.fromAsset("lambda"),
        handler: "GetUser.handler",
        environment: {
          TABLE_NAME: userTable.tableName,
        },
      }
    );

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

    // ===============================================================================
    // CREATED APIGATEWAY INTEGRATION OF FUNCTION WITH APIGATEWAY
    // ===============================================================================

    const postLambdaIntegration =
      new apigwv2_integrations.HttpLambdaIntegration(
        `${service}-${stage}-post-lambda-integration`,
        postLambda
      );

    const getLambdaIntegration = new apigwv2_integrations.HttpLambdaIntegration(
      `${service}-${stage}-get-lambda-integration`,
      getLambda
    );

    const updateAddressLambdaIntegration =
      new apigwv2_integrations.HttpLambdaIntegration(
        `${service}-${stage}-update-address-lambda-integration`,
        updateAddressLambda
      );

    // ===============================================================================
    // CREATED ROUTES OF LAMBDA FUNCTIONS
    // ===============================================================================

    crudUserApi.addRoutes({
      path: "/create-user",
      methods: [apigwv2.HttpMethod.POST],
      integration: postLambdaIntegration,
    });

    crudUserApi.addRoutes({
      path: "/get-user",
      methods: [apigwv2.HttpMethod.POST],
      integration: getLambdaIntegration,
    });

    crudUserApi.addRoutes({
      path: "/update-address",
      methods: [apigwv2.HttpMethod.PUT],
      integration: updateAddressLambdaIntegration,
    });

    // ===============================================================================
    // DYNAMODB AND S3 BUCKET ACCESS PERMISSIONS
    // ===============================================================================

    userDataBucket.grantReadWrite(dynamodbStreamLambda);
    userTable.grantFullAccess(postLambda);
    userTable.grantFullAccess(getLambda);
    userTable.grantFullAccess(updateAddressLambda);

    //==================================================================
    // Output API Gateway URL
    //==================================================================

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: crudUserApi.url!,
    });
  }
}
