import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import * as AWS from "aws-sdk";
import getUserEventValidation from "./helpers/getUserEventValidation";
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  // REQUEST VALIDATION
  const getUserEventValidationResponse = getUserEventValidation(event);

  if (getUserEventValidationResponse) return getUserEventValidationResponse;

  // BODY DATA PARSING
  const requestBody = JSON.parse(event.body!);

  let { user_id } = requestBody;

  // DYNAMODB GET OBJECT PARAMS
  const params = {
    TableName: process.env.TABLE_NAME!,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: {
      "#pk": "user_id",
    },
    ExpressionAttributeValues: {
      ":pk": user_id,
    },
  };

  try {
    // GETTING OBJECTS FROM DYNAMODB
    const items = await dynamodb.query(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ data: items.Items }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error }),
    };
  }
};
