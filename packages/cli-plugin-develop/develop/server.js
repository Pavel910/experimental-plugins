/* eslint-disable */
const express = require("express");
const bodyParser = require("body-parser");
const chalk = require("chalk");
const fs = require("fs");
const { resolve } = require("path");
const { expressToLambda } = require("./expressToLambda");

const setEnvironmentVariables = (map, resources) => {
  Object.keys(map).forEach(key => {
    const matches = map[key].match(/\${(\w*:?[\w\d.-]+)}/g);
    if (matches) {
      const [resource, ...props] = match
        .substring(2, match.length - 1)
        .split(".");



    }
  });
};

const executeHandler = async ({ fn, req, res, resources }) => {
  const [file, exp] = fn.handler.split(".");
  const handler = require(resolve(fn.code, file))[exp];

  // Set process.env
  setEnvironmentVariables(fn.env, resources);

  const result = await handler(expressToLambda(req), {});

  res.set(result.headers);
  res.status(result.statusCode).send(result.body);
};

module.exports.createServer = ({ port, resources }) => {
  const app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ limit: "25mb", extended: true }));

  // OPTIONS
  app.options("*", async (req, res) => {
    res
      .set({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*"
      })
      .status(200)
      .send();
  });

  const apiGateway = Object.values(resources).find(
    res => res.type === "api-gateway"
  );

  apiGateway.endpoints.forEach(endpoint => {
    console.log(
      `> Adding route "${endpoint.path}" pointing to "${endpoint.function}"`
    );

    app.all(endpoint.path, async (req, res) => {
      const match = endpoint.function.match(/\${(\w*:?[\w\d.-]+)}/g);
      const [fnName] = match[0].substring(2, match[0].length - 1).split(".");

      const target = functions.find(fn => fn.name === fnName);
      if (!target) {
        res.status(404).send(`Target function "${fnName}" was not found!`);
      }

      if (!fs.existsSync(target.function.code)) {
        res.status(404).send(`Target function "${fnName}" code doesn't exist!`);
      } else {
        await executeHandler(target.function, req, res);
      }
    });
  });

  /////////////////////////////////////////////////////////////////////////////
  app.listen(port, () => {
    console.log(
      `${chalk.cyan(`🚀 Stack running on port ${port}...`)} ${chalk.grey(
        "(Hit Ctrl+C to abort)"
      )}`
    );
  });
};
