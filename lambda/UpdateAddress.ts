import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import * as AWS from "aws-sdk";
import updateAddressEventValidation from "./helpers/updateAddressEventValidation";
import { Address } from "./helpers/types";
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const updateAddressEventValidationResponse = updateAddressEventValidation(event);
  console.log("event ===>", event);

  if (updateAddressEventValidationResponse) return updateAddressEventValidationResponse;

  const requestBody = JSON.parse(event.body!);

  console.log("fahad  ==>", requestBody);

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
    const userData: any = user.Items;
    console.log("USerDAta ==>", userData);
    const userAddresses = userData[0].addresses;
    const userAddress = userAddresses.find((address: Address) => address.id === address_id);
    console.log("User Address", userAddress);

    for (let key in address) {
      if (userAddress.hasOwnProperty(key)) {
        userAddress[key] = address[key];
      }
    }

    const addressToReplace = userAddresses.findIndex(
      (address: Address) => address.id === userAddress.id
    );

    if (addressToReplace !== -1) {
      userAddresses[addressToReplace] = userAddress;
    }

    console.log("user Address after updation==>", userAddress);
    console.log("user Addresses after updation after replacing==>", userAddresses);

    const updateAddressparams = {
      TableName: process.env.TABLE_NAME!,
      Key: {
        user_id: user_id,
      },
      UpdateExpression: "SET addresses = :addressesValue",
      ExpressionAttributeValues: {
        ":addressesValue": userAddresses,
      },
      ReturnValues: "ALL_NEW",
    };

    await dynamodb.update(updateAddressparams).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ data: "Data Updated Successfully" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error }),
    };
  }
};
