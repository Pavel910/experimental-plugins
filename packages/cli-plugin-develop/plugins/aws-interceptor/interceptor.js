const nock = require("nock");
const { blue } = require("chalk");

const requestToLambda = (req, requestBody) => {
  const event = {
    headers: requestBody.headers,
    path: "/",
    resource: "/",
    httpMethod: requestBody.httpMethod,
    body: requestBody.body,
    isBase64Encoded: requestBody.isBase64Encoded,
  };

  return event;
};

module.exports = (context) => {
  nock(/amazonaws.com/)
    .persist()
    .post(/.*/)
    .reply(function (uri, requestBody, callback) {
      // console.log("> Host", blue(this.req.options.hostname));
      // console.log("> Pathname", blue(this.req.path));
      // console.log("> Body", blue(requestBody));

      // TODO: process request using plugins
      if (this.req.options.hostname.startsWith("lambda")) {
        const name = uri.split("/")[3];
        const event = requestToLambda(this.req, JSON.parse(requestBody));
        return context.develop.executeFunction({ name, event }, context).then((res) => {
          callback(null, [200, res]);
        });
      }

      callback(null, [201, "THIS IS THE REPLY BODY", { header: "value" }]);
    });
};
