import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import * as AWS from "aws-sdk";
import updateAddressEventValidation from "./helpers/updateAddressEventValidation";
import { User } from "./helpers/types";
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const updateAddressEventValidationResponse = updateAddressEventValidation(event);
  console.log("event ===>", event);

  if (updateAddressEventValidationResponse) return updateAddressEventValidationResponse;

  const requestBody = JSON.parse(event.body!);

  let { user_id, address_id, address } = requestBody;

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
    const user = await dynamodb.query(params).promise();
    const userData = user.Items!;
    console.log("User data ==>", userData);
    return {
      statusCode: 200,
      body: JSON.stringify({ data: "User Created Successfully" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error }),
    };
  }
};
