import * as AWS from "aws-sdk";
import { DynamoDBStreamEvent } from "aws-lambda";

const s3 = new AWS.S3();
export const handler = async (event: DynamoDBStreamEvent) => {
  const bucketName = process.env.BUCKET_NAME;
  console.log("data returned by dynamodb stream ===>", event);

  //   for (const record of event.Records) {
  //     const data = JSON.stringify(record!.dynamodb.NewImage);
  //     const key = `${record.eventID}.json`;

  //     const params = {
  //       Bucket: bucketName,
  //       Key: key,
  //       Body: data,
  //     };

  //     await s3.putObject(params).promise();
  //   }
};
