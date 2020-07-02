const { executeFunction } = require("./executeFunction");
const { expressToLambda } = require("./expressToLambda");

const getFunctionNameFromReference = (reference) => {
  const match = reference.match(/\${(\w*:?[\w\d.-]+)}/g);
  const [fnName] = match[0].substring(2, match[0].length - 1).split(".");
  return fnName;
};

module.exports = {
  executeFunction,
  expressToLambda,
  getFunctionNameFromReference
};
