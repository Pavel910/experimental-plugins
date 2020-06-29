module.exports = () => [
  {
    type: "hook-before-deploy",
    hook(options, context) {
      console.log("Global beforeDeploy hook!");
    }
  },
  {
    type: "hook-after-deploy",
    hook({ state }) {
      console.log("Global afterDeploy hook!");
    }
  }
];
