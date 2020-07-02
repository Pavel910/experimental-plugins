/* eslint-disable */
const express = require("express");
const bodyParser = require("body-parser");
const chalk = require("chalk");
const { executeFunction, expressToLambda, getFunctionNameFromReference } = require("../../utils");

module.exports.createServer = ({ apiGateway, port }, context) => {
  // Construct express app
  const app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ limit: "25mb", extended: true }));

  // OPTIONS
  app.options("*", async (req, res) => {
    res
      .set({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      })
      .status(200)
      .send();
  });

  apiGateway.inputs.endpoints.forEach((endpoint) => {
    console.log(`> Adding route "${endpoint.path}" pointing to "${endpoint.function}"`);

    app.all(endpoint.path, async (req, res) => {
      const fnName = getFunctionNameFromReference(endpoint.function);

      try {
        const event = expressToLambda(req);
        const result = await executeFunction({ name: fnName, event }, context);
        res.set(result.headers);
        res.status(result.statusCode).send(result.body);
      } catch (err) {
        res.status(404).send(err.message);
      }
    });
  });

  app.listen(port, () => {
    console.log(
      `${chalk.cyan(`🚀 Stack running on port ${port}...`)} ${chalk.grey("(Hit Ctrl+C to abort)")}`
    );
  });
};
