import { APIGatewayProxyEventV2 } from "aws-lambda";
import { HttpStatusCode } from "axios";
import { ResponseBody } from "./types";
import responseObject from "./responseObject";

const createUserEventValidation = (event: APIGatewayProxyEventV2): null | ResponseBody => {
  if (!event.body)
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: No body is provided to the API.",
    });

  let requestBody = JSON.parse(event.body);

  let { name, age, email, addresses } = requestBody;

  if (!name || !age || !email) {
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: Required credentials are missing.",
    });
  }

  if (typeof name !== "string" || typeof age !== "number" || typeof email !== "string") {
    return responseObject(HttpStatusCode.BadRequest, {
      error: "Bad Request: Invalid credentials found.",
    });
  }

  for (let address of addresses) {
    if (!address.street || !address.city || !address.state || !address.postalCode) {
      return responseObject(HttpStatusCode.BadRequest, {
        error: "Bad Request: Required credentials are missing.",
      });
    }

    if (
      typeof address.street !== "string" ||
      typeof address.city !== "string" ||
      typeof address.state !== "string" ||
      typeof address.postalCode !== "string"
    ) {
      return responseObject(HttpStatusCode.BadRequest, {
        error: "Bad Request: Invalid credentials found.",
      });
    }
  }

  return null;
};

export default createUserEventValidation;
