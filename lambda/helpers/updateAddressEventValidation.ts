import { APIGatewayProxyEventV2 } from "aws-lambda";
import { HttpStatusCode } from "axios";
import { ResponseBody } from "./types";
import responseObject from "./responseObject";

const updateAddressEventValidation = (event: APIGatewayProxyEventV2): null | ResponseBody => {
  if (!event.body)
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: No body is provided to the API.",
    });

  let requestBody = JSON.parse(event.body);

  let { user_id, address_id } = requestBody;

  if (!user_id || !address_id) {
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: Required Credentials are missing.",
    });
  }

  if (typeof user_id !== "string" || typeof address_id !== "string") {
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: Invalid Credentials.",
    });
  }

  return null;
};

export default updateAddressEventValidation;
