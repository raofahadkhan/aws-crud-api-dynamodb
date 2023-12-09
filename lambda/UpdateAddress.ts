import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import * as AWS from "aws-sdk";
import updateAddressEventValidation from "./helpers/updateAddressEventValidation";
import { Address } from "./helpers/types";
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  // REQUEST VALIDATION
  const updateAddressEventValidationResponse =
    updateAddressEventValidation(event);

  if (updateAddressEventValidationResponse)
    return updateAddressEventValidationResponse;

  // PARSING BODY DATA
  const requestBody = JSON.parse(event.body!);

  let { user_id, address_id, address } = requestBody;

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
    const user = await dynamodb.query(params).promise();
    const userData: any = user.Items;

    const userAddress = userData.addresses.find(
      (address: Address) => address.id === address_id
    );

    // CHECKING IF THE ADDRESS IS THERE IF YES THAN UPDATE
    for (let key in address) {
      if (address.hasOwnProperty(key)) {
        userAddress[0][key] = address[key];
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ data: userAddress }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error }),
    };
  }
};
