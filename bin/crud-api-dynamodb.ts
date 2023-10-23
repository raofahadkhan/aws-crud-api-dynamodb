#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CrudApiDynamodbStack } from "../lib/crud-api-dynamodb-stack";

const app = new cdk.App();
const service = "crud-api-dynamodb";
let stage;

stage = "main";
new CrudApiDynamodbStack(app, `${service}-${stage}`, {
  tags: {
    service,
    stage,
  },
});

stage = "dev";
new CrudApiDynamodbStack(app, `${service}-${stage}`, {
  tags: {
    service,
    stage,
  },
});
