const { resolve, basename } = require("path");
const utils = require("./graph");
const { executeFunction } = require("../utils");

const getStackName = (folder) => {
  folder = folder.split("/").pop();
  return folder === "." ? basename(process.cwd()) : folder;
};

module.exports = async (inputs, context) => {
  const { projectRoot } = context.paths;
  const stack = getStackName(inputs.folder);
  await context.loadEnv(resolve(projectRoot, ".env.json"), null, {
    debug: false,
  });
  await context.loadEnv(resolve(projectRoot, stack, ".env.json"), null, {
    debug: false,
  });

  const resourcesJs = require(resolve(inputs.folder, "resources.js"));
  const { resources: template } = await resourcesJs({ cli: inputs });

  const resolvedTemplate = utils.resolveTemplate(inputs, template);
  const resources = utils.setDependencies(utils.getAllComponents(resolvedTemplate));
  const graph = utils.createGraph(resources);

  const initPlugins = context.plugins.byType("cli-develop-before-resources");
  for (let i = 0; i < initPlugins.length; i++) {
    await initPlugins[i].run({ resources }, context);
  }

  context.develop = {
    stack,
    resources,
    executeFunction,
  };

  // Execute the graph and setup local services on fly
  await utils.executeGraph({ graph, stack, resources }, context);
};
