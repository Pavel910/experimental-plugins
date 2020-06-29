const util = require("util");
const inspectOpts = { colors: [6, 2, 3, 4, 5, 1] };

modules.exports.logger = (...args) => {
  let index = 0;
  args[0] = args[0].replace(/%([a-zA-Z])/g, match => {
    index++;
    match = util.inspect(args[index], inspectOpts).replace(/\s*\n\s*/g, " ");
    // remove `args[index]` since it's inlined
    args.splice(index, 1);
    index--;

    return match;
  });

  console.log(...args);
};
