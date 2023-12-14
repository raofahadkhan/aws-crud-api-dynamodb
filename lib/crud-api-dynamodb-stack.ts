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
    // IAM: CREATED IAM ROLE FOR GLUE
    // ===============================================================================

    const glueRole = new iam.Role(this, `${service}-${stage}-glue-role`, {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSGlueServiceRole"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonDynamoDBReadOnlyAccess"
        ),
      ],
    });

    // ===============================================================================
    // GLUE: CREATED A GLUE DATABASE
    // ===============================================================================

    const glueDatabase = new glue.CfnDatabase(
      this,
      `${service}-${stage}-glue-database`,
      {
        catalogId: cdk.Aws.ACCOUNT_ID,
        databaseInput: {
          name: "my_glue_database",
        },
      }
    );

    // ===============================================================================
    // GLUE: CREATED A GLUE CRAWLER
    // ===============================================================================

    const crawler = new glue.CfnCrawler(this, `${service}-${stage}-crawler`, {
      databaseName: glueDatabase.ref,
      role: glueRole.roleArn,
      targets: {
        s3Targets: [{ path: `s3://${userDataBucket.bucketName}` }],
        dynamoDbTargets: [{ path: userTable.tableName }],
      },
    });

    // ===============================================================================
    // GLUE: CREATED A GLUE TABLE
    // ===============================================================================

    new glue.CfnTable(this, `${service}-${stage}-glue-table`, {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseName: glueDatabase.ref,
      tableInput: {
        name: userTable.tableName,
        storageDescriptor: {
          columns: [
            { name: "user_id", type: "string" },
            { name: "name", type: "string" },
            { name: "age", type: "string" },
            { name: "email", type: "string" },
            // { name: "address", type: "string" },
          ],
          location: `dynamodb://${userTable.tableName}`,
        },
        tableType: "EXTERNAL_TABLE",
        parameters: {
          "dynamodb.table.name": userTable.tableName,
          classification: "dynamodb",
        },
      },
    });

    // Athena Workgroup Setup
    const athenaWorkgroup = new athena.CfnWorkGroup(
      this,
      `${service}-${stage}-athena-workgroup`,
      {
        name: `${service}-${stage}-athena-workgroup`,
        state: "ENABLED",
        description: "Workgroup for querying DynamoDB data in S3",
        workGroupConfiguration: {
          resultConfiguration: {
            outputLocation: `s3://${userDataBucket.bucketName}/query-results`,
            encryptionConfiguration: {
              encryptionOption: "SSE_S3", // or "SSE_KMS" for KMS-managed keys
              // kmsKey: "your-kms-key-arn" // Uncomment if using SSE_KMS
            },
          },
          enforceWorkGroupConfiguration: true,
          publishCloudWatchMetricsEnabled: true,
          // Additional configurations like data usage limits
        },
      }
    );

    // IAM Role for Athena to Access Glue Data Catalog and S3
    const athenaAccessRole = new iam.Role(
      this,
      `${service}-${stage}-athena-access-role`,
      {
        assumedBy: new iam.ServicePrincipal("athena.amazonaws.com"),
      }
    );

    // Attach policies to the role
    athenaAccessRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "glue:GetDatabase",
          "glue:GetDatabases",
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetPartition",
          "glue:GetPartitions",
          "glue:BatchGetPartition",
        ],
        resources: ["*"], // Restrict as necessary
      })
    );

    // ===============================================================================
    // APIGATEWAY: CREATED HTTP API FOR CRUD OPERATION OF USERS
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
  }
}
