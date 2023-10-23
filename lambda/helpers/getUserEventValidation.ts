import { APIGatewayProxyEventV2 } from "aws-lambda";
import { HttpStatusCode } from "axios";
import { ResponseBody } from "./types";
import responseObject from "./responseObject";

const getUserEventValidation = (event: APIGatewayProxyEventV2): null | ResponseBody => {
  if (!event.body)
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: No body is provided to the API.",
    });

  let requestBody = JSON.parse(event.body);

  let { user_id } = requestBody;

  if (!user_id) {
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: user_id is missing.",
    });
  }

  if (typeof user_id !== "string") {
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: user_id should be string.",
    });
  }

  return null;
};

export default getUserEventValidation;
