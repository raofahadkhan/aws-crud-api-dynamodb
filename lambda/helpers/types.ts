import { HttpStatusCode } from "axios";

export interface ResponseBody {
  statusCode: HttpStatusCode;
  body: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface User {
  name: string;
  age: number;
  email: string;
  addresses: Address[];
  isStudent: boolean;
}
