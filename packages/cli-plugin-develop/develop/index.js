const { resolve } = require("path");
const { createServer } = require("./server");
const utils = require("./graph");

const API_GATEWAY_PORT = 9000;

const COMPONENT_MAP = {
  "@webiny/severless-function": "function",
  "@webiny/severless-api-gateway": "api-gateway",
  "@webiny/severless-aws-s3": "s3-bucket",
  "@webiny/severless-aws-s3-object": "s3-object",
  "@webiny/serverless-aws-cognito-user-pool": "cognito-user-pool"
};

const getStackName = folder => {
  folder = folder.split("/").pop();
  return folder === "." ? basename(process.cwd()) : folder;
};

const formatResources = source => {
  const resources = [];
  // TODO: use plugins to process each resource
  Object.keys(source).forEach(key => {
    const resource = { name: key, arn: key };
    const component = source[key].component || source[key].deploy.component;
    if (!(component in COMPONENT_MAP)) {
      return;
    }
    resource.type = COMPONENT_MAP[component];
    resource.build = source[key].build || null;
    resource.inputs = source[key].inputs || source[key].deploy.inputs;
    resources.push(resource);
  });

  return resources;
};

module.exports = async (inputs, context) => {
  const { projectRoot } = context.paths;
  const stack = getStackName(inputs.folder);
  await context.loadEnv(resolve(projectRoot, ".env.json"), null, {
    debug: false
  });
  await context.loadEnv(resolve(projectRoot, stack, ".env.json"), null, {
    debug: false
  });

  const resourcesJs = require(resolve(inputs.folder, "resources.js"));
  const { resources: template } = await resourcesJs({ cli: inputs });

  const resolvedTemplate = utils.resolveTemplate(inputs, template);
  const resources = utils.setDependencies(
    utils.getAllComponents(resolvedTemplate)
  );

  const graph = utils.createGraph(resources);

  const start = Date.now();
  await utils.executeGraph(graph, resources, context);

  process.exit();

  // createServer({
  //   port: API_GATEWAY_PORT,
  //   resources: formatResources(resources)
  // });
};
