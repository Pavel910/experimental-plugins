module.exports = {
    type: "cli-develop-resource",
    component: "@webiny/serverless-function",
    run({ resource, resources }, context) {
        console.log(`> Nothing to setup.`);
    },
    interpolateReference({ reference, resource }) {
        switch (reference) {
            case "arn":
            case "name":
                return resource.name;
            default:
                throw Error(
                    `Unable to interpolate "${reference}" on "${reference.name}" resource.`
                );
        }
    }
};
