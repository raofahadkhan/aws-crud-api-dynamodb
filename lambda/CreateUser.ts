import * as AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import createUserEventValidation from "./helpers/createUserEventValidation";
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const createUserEventValidationResponse = createUserEventValidation(event);
  console.log("event ===>", event);

  // REQUEST VALIDATION
  if (createUserEventValidationResponse)
    return createUserEventValidationResponse;

  // BODY PARSING
  const requestBody = JSON.parse(event.body!);

  let { name, age, email, addresses } = requestBody;

  // ADDING UNIQUE ID'S IN ADDRESSES
  for (let address of addresses) {
    address["id"] = uuidv4();
    console.log(address);
  }

  // DYANMODB PUT OBJECT PARAMS
  const params = {
    TableName: process.env.TABLE_NAME!,
    Item: {
      user_id: uuidv4(),
      name: name,
      age: age,
      email: email,
      addresses: addresses,
    },
  };

  try {
    // PUTTING DATA INTO DYNAMODB
    await dynamodb.put(params).promise();

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
