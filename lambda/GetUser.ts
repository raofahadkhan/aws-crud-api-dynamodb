import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import * as AWS from "aws-sdk";
import getUserEventValidation from "./helpers/getUserEventValidation";
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const getUserEventValidationResponse = getUserEventValidation(event);
  console.log("event ===>", event);

  if (getUserEventValidationResponse) return getUserEventValidationResponse;

  const requestBody = JSON.parse(event.body!);

  let { user_id } = requestBody;

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
