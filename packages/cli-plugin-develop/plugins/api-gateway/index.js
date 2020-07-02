module.exports = {
  type: "cli-develop-resource",
  component: "@webiny/serverless-api-gateway",
  run({ resource }, context) {
    console.log(`> Setup express server`);
    const port = 9000;

    const { createServer } = require("./server");
    createServer({ apiGateway: resource, port }, context);
  },
};
