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

    // Create IAM Role for AWS Glue
    const glueRole = new iam.Role(this, "GlueRole", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      description: "Role for AWS Glue to access S3 and Glue services",
    });

    // Policy to allow Glue to access the specific S3 bucket
    const s3Policy = new iam.PolicyStatement({
      actions: [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ],
      // Replace with your S3 bucket ARN
      resources: [`${userDataBucket.bucketArn}/*`, userDataBucket.bucketArn],
    });
    glueRole.addToPolicy(s3Policy);

    const athenaRole = new iam.Role(this, "AthenaRole", {
      assumedBy: new iam.ServicePrincipal("athena.amazonaws.com"),
      description: "Role for Athena to access specific S3 bucket",
    });

    athenaRole.addToPolicy(s3Policy);

    // Policy for AWS Glue service actions
    const glueServicePolicy = new iam.PolicyStatement({
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
    });
    glueRole.addToPolicy(glueServicePolicy);

    // Attach AWS managed policy for Glue Service Role
    glueRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSGlueServiceRole"
      )
    );

    // ===============================================================================
    // GLUE: Create a Glue Database for cataloging tables
    // ===============================================================================
    const glueDatabase = new glue.CfnDatabase(this, "GlueDatabase", {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseInput: {
        name: "my_glue_database", // Replace with your desired database name
      },
    });

    const glueTable = new glue.CfnTable(this, "GlueTable", {
      databaseName: glueDatabase.ref,
      catalogId: cdk.Aws.ACCOUNT_ID,
      tableInput: {
        name: "my-gluetable",
        // Define the table schema here based on your JSON data structure
        storageDescriptor: {
          columns: [
            { name: "user_id", type: "string" },
            { name: "name", type: "string" },
            { name: "age", type: "string" },
            { name: "email", type: "string" },
          ],
          location: `s3://${userDataBucket.bucketName}/data-lake/`, // Specify the S3 location of your data
          // Add any other storage properties as needed
        },
        // Define other table properties as needed
      },
    });

    // ===============================================================================
    // GLUE: Create a Crawler for JSON data in S3
    // ===============================================================================
    const jsonCrawler = new glue.CfnCrawler(this, "JsonDataCrawler", {
      role: glueRole.roleArn,
      databaseName: glueDatabase.ref,
      targets: {
        s3Targets: [
          {
            path: `s3://${userDataBucket.bucketName}/`, // Path to the root of the S3 bucket
          },
        ],
      },
      // Define other properties like schedule, crawler name, etc., as needed
    });
    // Get the AWS account ID
    const ownerAccountId = cdk.Aws.ACCOUNT_ID;
    // Create an Athena Workgroup
    const workgroup = new athena.CfnWorkGroup(this, "AthenaWorkgroup", {
      name: "your-workgroup-name", // Replace with your workgroup name
      recursiveDeleteOption: false, // Set to true if you want query results to be deleted when the workgroup is deleted
      state: "ENABLED", // You can set it to 'DISABLED' initially if needed
      description: "Your Athena Workgroup", // Replace with your workgroup description
      workGroupConfiguration: {
        // Configure query result location
        enforceWorkGroupConfiguration: true,
        resultConfiguration: {
          outputLocation: `s3://${userDataBucket.bucketName}/athena-results/`,
        },
        publishCloudWatchMetricsEnabled: true,
        // You can configure other workgroup settings here
      },
      // workGroupConfigurationUpdates: {
      //   removeBytesScannedCutoffPerQuery: false,
      //   enforceWorkGroupConfiguration: true,
      //   requesterPaysEnabled: false,
      //   resultConfigurationUpdates: {
      //     outputLocation: `s3://${userDataBucket.bucketName}/athena-results/`,
      //   },
      // },
      // Note: Directly setting the S3 bucket owner ID in the workgroup isn't standard.
      // This is just to demonstrate how to reference the account ID.
      tags: [{ key: "OwnerAccountId", value: ownerAccountId }],
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
