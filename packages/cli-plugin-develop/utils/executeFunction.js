const { join, resolve } = require("path");
const fs = require("fs");
const indentString = require("indent-string");

const indent = (num) => {
  const original = console.log;
  console.log = (first, ...args) => {
    if (typeof first === "string") {
      if (first.includes("QueryPlan")) {
        return;
      }
      original(indentString(first, num), ...args);
    } else {
      original(first, ...args);
    }
  };
  return () => (console.log = original);
};

module.exports.executeFunction = async ({ name, event }, context) => {
  const unindent = indent(2);
  console.log(`> Executing function "${name}"`);
  const setEnvironmentVariables = (map = {}) => {
    Object.keys(map).forEach((key) => {
      let value = map[key];
      const matches = map[key].match(/\${(\w*:?[\w\d.-]+)}/g);
      if (matches) {
        const match = matches[0];
        const [name, ...props] = match.substring(2, match.length - 1).split(".");
        const resource = context.develop.resources[name];
        const plugin = context.plugins
          .byType("cli-develop-resource")
          .find((pl) => pl.component === resource.component);

        value = plugin.interpolateReference({ reference: props.join("."), resource }, context);
      }
      // console.log(`> process.env.${key}=${value}`);
      process.env[key] = value;
    });
  };

  const target = context.develop.resources[name];
  if (!target) {
    throw new Error(`Target function "${name}" was not found!`);
  }

  const { inputs } = context.develop.resources[name];

  const code = join(process.cwd(), context.develop.stack, inputs.code);

  if (!fs.existsSync(code)) {
    const msg = `Target function "${name}" code doesn't exist at ${code}!`;
    console.log(msg);
    throw new Error(msg);
  }

  const [file, exp] = inputs.handler.split(".");

  // Set process.env
  setEnvironmentVariables(inputs.env);

  // TODO: try executing handler in a sandbox using v8 with localized process.env
  const handler = require(resolve(context.develop.stack, inputs.code, file))[exp];
  const res = await handler(event, {});
  unindent();
  return res;
};
