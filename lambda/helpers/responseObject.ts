import { HttpStatusCode } from "axios";
import { ResponseBody } from "./types";

const responseObject = (statusCode: HttpStatusCode, input_body: unknown): ResponseBody => ({
  statusCode,
  body: JSON.stringify(input_body),
});

export default responseObject;
