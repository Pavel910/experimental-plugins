module.exports = {
  type: "cli-develop-before-resources",
  name: "cli-develop-before-resources-aws",
  async run({ resources }, context) {
    console.log(`Attaching AWS listener...`);
    require("./interceptor")(context);
  },
};
