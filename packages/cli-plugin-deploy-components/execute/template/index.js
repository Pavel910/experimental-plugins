const path = require("path");
const fs = require("fs");
const { blue } = require("chalk");
const { Listr } = require("listr2");
const { Component } = require("@webiny/serverless-component");
const buildResource = require("./buildResource");
const { compose } = require("./compose");
const setupFileWatchers = require("./watch");

const {
  getTemplate,
  getAllComponents,
  setDependencies,
  createGraph,
  executeGraph,
  syncState,
  resolveTemplate,
  resolveObject,
  getOutputs,
  findTemplate,
  executeComponent
} = require("./utils");

const validateInputs = ({ env }) => {
  if (typeof env !== "string" || env.length === 0) {
    throw Error("An `--env` parameter must be specified!");
  }
};

class Template extends Component {
  async default(inputs = {}, cliContext) {
    require("./tsRequire")({
      projectRoot: cliContext.paths.projectRoot,
      tmpDir: cliContext.resolve(".webiny", "tmp")
    });

    validateInputs(inputs);

    let template;
    if (fs.existsSync(`resources.js`)) {
      const newTemplate = await require(path.resolve("resources.js"))({
        cli: inputs,
        context: cliContext
      });
      template = newTemplate.resources;
    } else if (fs.existsSync(`resources.ts`)) {
      const resources = require(path.resolve("resources.ts")).default;
      const newTemplate = await resources({ cli: inputs });
      template = newTemplate.resources;
    } else {
      template = await findTemplate();
    }

    if (inputs.resources.length) {
      return await this.deployResources(
        inputs.resources,
        { ...inputs, template },
        cliContext
      );
    }

    // Run template
    return await this.deployAll({ ...inputs, template }, cliContext);
  }

  async deployAll(inputs = {}, cliContext) {
    const template = await getTemplate(inputs);

    const resolvedTemplate = resolveTemplate(inputs, template);

    const allComponents = setDependencies(getAllComponents(resolvedTemplate));

    const graph = createGraph(allComponents);

    await syncState(allComponents, this);

    const start = Date.now();
    const tasks = executeGraph(
      cliContext,
      graph,
      this,
      inputs,
      async ({ resource, buildConfig }) => {
        await buildResource({
          resource,
          debug: inputs.debug,
          config: buildConfig,
          context: this.context
        });
      }
    );

    let timer = null;
    console.log("");
    const runner = new Listr(
      [
        {
          title: `Deploying ${blue(inputs.stack)} stack`,
          task(context, task) {
            let time = 1;
            timer = setInterval(() => {
              task.title = `Deploying ${blue(
                inputs.stack
              )} stack (duration: ${blue(`${time}s`)})`;
              time++;
            }, 1000);
            return task.newListr(tasks);
          }
        }
      ],
      {
        concurrent: false,
        rendererOptions: {
          collapse: false
        }
      }
    );

    await runner.run({ allComponents });
    clearInterval(timer);

    const outputs = getOutputs(allComponents);

    this.state.outputs = outputs;
    await this.save();

    await inputs.callback({
      output: this.state.outputs,
      duration: (Date.now() - start) / 1000
    });

    return outputs;
  }

  async deployResources(resources, inputs, context) {
    const template = await getTemplate(inputs);

    if (!this.state.outputs) {
      throw Error(
        `You must deploy the entire infrastructure before you can do partial deployments.`
      );
    }

    Object.keys(this.state.outputs).forEach(key => {
      if (!resources.includes(key)) {
        template[key] = this.state.outputs[key];
      }
    });

    const resolvedTemplate = resolveTemplate(inputs, template);
    const allComponents = setDependencies(getAllComponents(resolvedTemplate));
    const { debug, watch, callback } = inputs;

    await new Promise(async (resolve, reject) => {
      // `firstBuild` is the first build cycle before entering the `watch` mode
      let firstBuild = true;

      // Due to internal logging/debug mechanism of `@serverless/components`, we need to execute deployments in series.
      // Otherwise, debug output will be messed up. `compose` creates a middleware similar to `express`,
      // and we can control when the next Promise is to be executed using the `next` callback.
      const middleware = compose(
        resources.map(resource => {
          return async next => {
            const resourceData = allComponents[resource];

            // If a resource does not exist or an invalid resource name was provided, throw an error.
            if (!resourceData) {
              throw new Error(`Resource "${resource}" does not exist.`);
            }

            const deployComponent = async () => {
              const start = Date.now();
              await executeComponent(
                resource,
                allComponents,
                resourceData,
                this,
                inputs
              );
              Object.assign(this.state.outputs, getOutputs(allComponents));
              await this.save();
              if (firstBuild) {
                next();
              } else {
                await callback({
                  context: this.context,
                  output: this.state.outputs,
                  duration: (Date.now() - start) / 1000
                });
              }
            };

            if (watch) {
              setupFileWatchers(
                deployComponent,
                resource,
                resourceData,
                context
              );
            }

            if (resourceData.build) {
              // Inject template values into `build` config
              const resolvedBuild = resolveObject(
                resourceData.build,
                getOutputs(allComponents)
              );

              // In `watch` mode, this will never resolve.
              // Deployment is run by file watchers setup earlier.
              await buildResource({
                resource,
                watch,
                debug,
                config: resolvedBuild,
                context: this.context
              });
            }

            await deployComponent();
          };
        })
      );

      const start = Date.now();
      try {
        await middleware();
      } catch (err) {
        return reject(err);
      }

      await callback({
        context: this.context,
        output: this.state.outputs,
        duration: (Date.now() - start) / 1000
      });
      firstBuild = false;

      if (!watch) {
        resolve();
      } else {
        console.log("Watching for changes...");
      }
    });

    return this.state.outputs;
  }

  async remove(inputs = {}) {
    validateInputs(inputs);

    await syncState({}, this);

    this.state = {};
    await this.save();

    return {};
  }
}

module.exports = Template;
