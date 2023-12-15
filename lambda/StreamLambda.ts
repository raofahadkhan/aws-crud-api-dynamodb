import * as AWS from "aws-sdk";
import { DynamoDBStreamEvent } from "aws-lambda";

const s3 = new AWS.S3();
export const handler = async (event: DynamoDBStreamEvent) => {
  const bucketName = process.env.BUCKET_NAME!;

  if (!bucketName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Bucket Name not provided!" }),
    };
  }

  for (const record of event.Records) {
    const data = record.dynamodb!.NewImage!;
    const dataToPut = {
      user_id: data!.user_id.S,
      name: data!.name.S,
      age: data!.age.N,
      email: data!.email.S,
    };

    console.log("desired format===>", dataToPut);
    const key = `${record.eventID}.json`;

    const params = {
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(dataToPut),
    };

    await s3.putObject(params).promise();
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Data Added to S3 Successfully!" }),
  };
};
