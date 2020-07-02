const AWS = require("aws-sdk");

(async () => {
  const s3 = new AWS.S3({
    s3ForcePathStyle: true,
    endpoint: "http://0.0.0.0:5001/",
  });

  console.log("buckets", await s3.listBuckets().promise());

  await s3
    .createBucket({
      Bucket: "test",
      CreateBucketConfiguration: {
        LocationConstraint: "eu-west-1",
      },
    })
    .promise();

  console.log("buckets", await s3.listBuckets().promise());
})();
