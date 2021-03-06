const fs = require("fs-extra");
const path = require("path");
const loadJsonFile = require("load-json-file");
const writeJsonFile = require("write-json-file");

const randomId = () =>
  Math.random()
    .toString(36)
    .substring(6);

class Context {
  constructor(config) {
    this.logger = config.logger;
    this.stackName = config.stackName;
    this.stateRoot = config.stateRoot;
    this.stackStateRoot = config.stackStateRoot;
    this.credentials = config.credentials || {};
    this.debugMode = config.debug || false;
    this.env = config.env;
    this.state = { id: randomId() };
    this.id = this.state.id;
    this.projectName = config.projectName;
    this.customLogger = null;
  }

  setLogger(logger) {
    this.customLogger = logger;
  }

  restoreLogger() {
    this.customLogger = null;
  }

  getLogger() {
    return this.customLogger || this.logger;
  }

  async init() {
    const contextStatePath = path.join(this.stateRoot, `_.json`);

    if (await fs.existsSync(contextStatePath)) {
      this.state = await loadJsonFile(contextStatePath);
    } else {
      await writeJsonFile(contextStatePath, this.state);
    }
    this.id = this.state.id;
  }

  /**
   * This method is used by @serverless/{component-name} components
   * so we need to keep it for compatibility.
   * @returns {string}
   */
  resourceId() {
    return `${this.id}-${randomId()}`;
  }

  async readState(id) {
    const stateFilePath = path.join(this.stackStateRoot, `${id}.json`);
    if (fs.existsSync(stateFilePath)) {
      return loadJsonFile(stateFilePath);
    }
    return {};
  }

  async writeState(id, state) {
    const stateFilePath = path.join(this.stackStateRoot, `${id}.json`);
    if (Object.keys(state).length === 0) {
      if (fs.existsSync(stateFilePath)) {
        await fs.unlink(stateFilePath);
      }
    } else {
      await writeJsonFile(stateFilePath, state);
    }
    return state;
  }

  log(...args) {
    this.getLogger().log(...args);
  }

  debug(...args) {
    this.getLogger().debug(...args);
  }
}

module.exports = { Context };
