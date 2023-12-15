import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as cdk from "aws-cdk-lib";
import * as athena from "aws-cdk-lib/aws-athena";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

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
            // New Policy Statement for DynamoDB Access
            new iam.PolicyStatement({
              actions: [
                "dynamodb:GetItem",
                "dynamodb:Scan",
                "dynamodb:Query",
                "dynamodb:DescribeTable", // Added DescribeTable Action
                // Add any other DynamoDB actions the crawler might need
              ],
              resources: [userTable.tableArn],
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

    glueRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:DescribeTable",
          // Add any other DynamoDB actions the crawler might need
        ],
        resources: [userTable.tableArn],
      })
    );

    const athenaRole = new iam.Role(this, `${service}-${stage}-athena-role`, {
      assumedBy: new iam.ServicePrincipal("athena.amazonaws.com"),
      description:
        "Role for Athena to access specific S3 bucket and Glue Data Catalog",
      inlinePolicies: {
        AthenaGlueS3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "s3:GetObject",
                "s3:PutObject",
                "s3:ListBucket",
                "s3:GetBucketLocation",
              ],
              resources: [
                `${userDataBucket.bucketArn}/*`,
                userDataBucket.bucketArn,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                "glue:GetDatabase",
                "glue:GetDatabases",
                "glue:GetTable",
                "glue:GetTables",
                "glue:SearchTables",
                "glue:GetPartition",
                "glue:GetPartitions",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: [
                "athena:GetWorkGroup",
                "athena:StartQueryExecution",
                "athena:StopQueryExecution",
                "athena:GetQueryExecution",
                "athena:GetQueryResults",
              ],
              resources: ["*"],
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
        dynamoDbTargets: [
          {
            path: userTable.tableName, // Specify the DynamoDB table ARN here
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
    // LAMBDA: CREATED LAMBDA FUNCTIONS
    // ===============================================================================

    const createUserLambda = new lambda.Function(
      this,
      `${service}-${stage}-create-user-lambda`,
      {
        functionName: `${service}-${stage}-create-user-lambda`,
        runtime: lambda.Runtime.NODEJS_18_X,
        code: lambda.Code.fromAsset("lambda"),
        handler: "CreateUser.handler",
        environment: {
          TABLE_NAME: userTable.tableName,
        },
      }
    );

    // ===============================================================================
    // CREATED APIGATEWAY INTEGRATION OF FUNCTION WITH APIGATEWAY
    // ===============================================================================

    const createUserLambdaIntegration =
      new apigwv2_integrations.HttpLambdaIntegration(
        `${service}-${stage}-create-user-lambda-integration`,
        createUserLambda
      );

    // ===============================================================================
    // CREATED ROUTES OF LAMBDA FUNCTIONS
    // ===============================================================================

    crudUserApi.addRoutes({
      path: "/create-user",
      methods: [apigwv2.HttpMethod.POST],
      integration: createUserLambdaIntegration,
    });

    // ===============================================================================
    // DYNAMODB AND S3 BUCKET ACCESS PERMISSIONS
    // ===============================================================================

    userTable.grantFullAccess(createUserLambda);

    // ===============================================================================
    // OUTPUT STATEMENT FOR API-GATEWAY URL
    // ===============================================================================

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: crudUserApi.url!,
    });
  }
}
