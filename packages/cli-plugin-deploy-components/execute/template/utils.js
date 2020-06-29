const { join } = require("path");
const { isEmpty, path } = require("ramda");
const { Graph, alg } = require("graphlib");
const traverse = require("traverse");
const { utils } = require("@serverless/core");
const { trackComponent } = require("@webiny/tracking");
const { red, green, bold, dim } = require("chalk");
const debug = require("debug");
const kebabCase = require("lodash.kebabcase");

const getResourceName = (component, name) => {
  const resourceNameParts = [
    component.context.instance.id,
    component.context.instance.stackName,
    component.context.instance.env,
    component.context.instance.resource,
    name ? kebabCase(name) : null
  ].filter(Boolean);

  let resourceName = resourceNameParts.join("_");

  if (resourceName.length > 64) {
    const diff = resourceName.length - 64;
    resourceNameParts[1] = resourceNameParts[1].substr(
      0,
      resourceNameParts[1].length - diff
    );
    resourceName = resourceNameParts.join("_");
  }

  return resourceName;
};

const getOutputs = allComponents => {
  const outputs = {};

  for (const resource in allComponents) {
    outputs[resource] = allComponents[resource].outputs;
  }

  return outputs;
};

const resolveObject = (object, context) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g;

  const resolvedObject = traverse(object).forEach(function(value) {
    const matches = typeof value === "string" ? value.match(regex) : null;
    if (matches) {
      let newValue = value;
      for (const match of matches) {
        const propPath = match.substring(2, match.length - 1).split(".");
        const propValue = path(propPath, context);

        if (propValue === undefined) {
          throw Error(`invalid reference ${match}`);
        }

        if (match === value) {
          newValue = propValue;
        } else if (typeof propValue === "string") {
          newValue = newValue.replace(match, propValue);
        } else {
          throw Error(`the referenced substring is not a string`);
        }
      }
      this.update(newValue);
    }
  });

  return resolvedObject;
};

const validateGraph = graph => {
  const isAcyclic = alg.isAcyclic(graph);
  if (!isAcyclic) {
    const cycles = alg.findCycles(graph);
    let msg = ["Your template has circular dependencies:"];
    cycles.forEach((cycle, index) => {
      let fromAToB = cycle.join(" --> ");
      fromAToB = `${(index += 1)}. ${fromAToB}`;
      const fromBToA = cycle.reverse().join(" <-- ");
      const padLength = fromAToB.length + 4;
      msg.push(fromAToB.padStart(padLength));
      msg.push(fromBToA.padStart(padLength));
    }, cycles);
    msg = msg.join("\n");
    throw new Error(msg);
  }
};

const getTemplate = async (inputs = {}) => {
  const template = inputs.template || {};

  if (typeof template === "string") {
    if (
      (!utils.isJsonPath(template) && !utils.isYamlPath(template)) ||
      !(await utils.fileExists(template))
    ) {
      throw Error("the referenced template path does not exist");
    }

    return utils.readFile(template);
  } else if (typeof template !== "object") {
    throw Error(
      "the template input could either be an object, or a string path to a template file"
    );
  }
  return template;
};

const resolveTemplate = (inputs, template) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g;
  let variableResolved = false;
  const resolvedTemplate = traverse(template).forEach(function(value) {
    const matches = typeof value === "string" ? value.match(regex) : null;
    if (matches) {
      let newValue = value;
      for (const match of matches) {
        // If ${cli.env} was matched, `propPath` will be ['cli', 'env']
        const propPath = match.substring(2, match.length - 1).split(".");
        const topLevelProp = propPath[0];
        if (/\${env\.(\w*:?[\w\d.-]+)}/g.test(match)) {
          // This block handles references to `env` variables
          newValue = process.env[propPath[1]];
          variableResolved = true;
        } else if (/\${cli\.(\w*:?[\w\d.-]+)}/g.test(match)) {
          // This block handles handles references to CLI parameters (--env, etc.)
          newValue = value.replace(match, inputs[propPath[1]]);
          variableResolved = true;
        } else if (/\${build\.(\w*:?[\w\d.-]+)}/g.test(match)) {
          // Ignore `build` as it is generated at "build" step of each component
        } else {
          // This block handles references to component output
          if (!template[topLevelProp]) {
            throw Error(`invalid reference ${match}`);
          }

          if (
            !template[topLevelProp].component &&
            !template[topLevelProp].deploy
          ) {
            variableResolved = true;
            const propValue = path(propPath, template);

            if (propValue === undefined) {
              throw Error(`invalid reference ${match}`);
            }

            if (match === value) {
              newValue = propValue;
            } else if (typeof propValue === "string") {
              newValue = newValue.replace(match, propValue);
            } else {
              throw Error(`the referenced substring is not a string`);
            }
          }
        }
      }
      this.update(newValue);
    }
  });
  if (variableResolved) {
    return resolveTemplate(inputs, resolvedTemplate);
  }
  return resolvedTemplate;
};

const getDeployableComponent = obj => {
  if (obj.component) {
    return obj;
  }

  if (obj.deploy && obj.deploy.component) {
    return obj.deploy;
  }

  return null;
};

const getAllComponents = (obj = {}) => {
  const allComponents = {};
  const options = { paths: [process.cwd()] };

  for (const key in obj) {
    const component = getDeployableComponent(obj[key]);
    if (component) {
      let componentPath = component.component;
      if (componentPath.startsWith(".")) {
        componentPath = join(process.cwd(), componentPath);
      }

      const resolvedPath = require.resolve(componentPath, options);

      allComponents[key] = {
        component: component.component,
        path: resolvedPath,
        inputs: component.inputs || {},
        build: obj[key].build || false,
        watch: obj[key].watch || false
      };
    }
  }

  return allComponents;
};

const setDependencies = allComponents => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g;

  for (const resource in allComponents) {
    const dependencies = traverse({
      ...allComponents[resource].inputs,
      ...allComponents[resource].build
    }).reduce(function(accum, value) {
      const matches = typeof value === "string" ? value.match(regex) : null;
      if (matches) {
        for (const match of matches) {
          const referencedComponent = match
            .substring(2, match.length - 1)
            .split(".")[0];

          if (!allComponents[referencedComponent]) {
            throw Error(
              `the referenced component in expression ${match} does not exist`
            );
          }

          if (!accum.includes(referencedComponent)) {
            accum.push(referencedComponent);
          }
        }
      }
      return accum;
    }, []);

    allComponents[resource].dependencies = dependencies;
  }

  return allComponents;
};

const createGraph = allComponents => {
  const graph = new Graph();

  for (const resource in allComponents) {
    graph.setNode(resource, allComponents[resource]);
  }

  for (const resource in allComponents) {
    const { dependencies } = allComponents[resource];
    if (!isEmpty(dependencies)) {
      for (const dependency of dependencies) {
        graph.setEdge(resource, dependency);
      }
    }
  }

  validateGraph(graph);

  return graph;
};

const executeComponent = async (
  resource,
  allComponents,
  componentData,
  instance,
  inputs,
  build = null
) => {
  const component = await instance.load(componentData.path, resource);
  component.context.instance.resource = resource;
  component.context.instance.getResourceName = (name = null) => {
    if (name && name.startsWith(component.context.instance.id)) {
      return name.substr(0, 64);
    }

    return getResourceName(component, name);
  };
  const availableOutputs = getOutputs(allComponents);
  try {
    if (componentData.build && typeof build === "function") {
      instance.context.status("Building", resource);
      await build({
        resource,
        buildConfig: resolveObject(componentData.build, availableOutputs)
      });
    }
    instance.context.status("Deploying", resource);
    const componentInputs = resolveObject(
      allComponents[resource].inputs,
      availableOutputs
    );
    allComponents[resource].outputs = (await component(componentInputs)) || {};
    await trackComponent({
      context: instance.context,
      component: componentData.path
    });
  } catch (err) {
    instance.context.log(
      `An error occurred during deployment of ${red(resource)}`
    );
    throw err;
  }
};

const createTaskLogger = (cliContext, task) => {
  return {
    log: (...args) => {
      task.output = cliContext.formatMessage(...args);
    },
    debug: (...args) => {
      task.output = cliContext.formatMessage(...args);
    }
  };
};

const executeGraph = (cliContext, graph, template, inputs, build) => {
  const tasks = [];
  let leaves = graph.sinks();

  while (!isEmpty(leaves)) {
    for (const resource of leaves) {
      const node = graph.node(resource);

      tasks.push({
        title: `${bold(resource)} ${dim(node.component)}`,
        task: async (context, task) => {
          const start = Date.now();
          template.context.instance.setLogger(
            createTaskLogger(cliContext, task)
          );

          await executeComponent(
            resource,
            context.allComponents,
            node,
            template,
            inputs,
            build
          );

          const duration = (Date.now() - start) / 1000;
          task.title = `${task.title} (deployed in ${green(`${duration}s`)})`;

          template.context.instance.restoreLogger();
        }
      });
      graph.removeNode(resource);
    }

    leaves = graph.sinks();
  }

  return tasks;
};

const syncState = async (allComponents, instance) => {
  const templateDebug = instance.context.instance.debug;

  for (const resource in instance.state.components || {}) {
    if (!allComponents[resource]) {
      try {
        const component = await instance.load(
          instance.state.components[resource],
          resource
        );
        component.context.instance.debug = debug(`webiny:${resource}`);
        instance.context.status("Removing", resource);
        await component.remove();
        instance.context.instance.debug = templateDebug;
        await trackComponent({
          context: instance.context,
          component: instance.state.components[resource],
          method: "remove"
        });
      } catch (e) {
        instance.context.log(
          `An error occurred while removing ${resource}: ${e.stack}`
        );
      }
    }
  }

  instance.state.components = {};

  for (const resource in allComponents) {
    instance.state.components[resource] = allComponents[resource].path;
  }

  await instance.save();
};

module.exports = {
  getTemplate,
  resolveTemplate,
  resolveObject,
  getAllComponents,
  setDependencies,
  createGraph,
  executeComponent,
  executeGraph,
  syncState,
  getOutputs
};
