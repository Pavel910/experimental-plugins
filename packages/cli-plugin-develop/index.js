module.exports = () => [
    {
        type: "cli-command",
        name: "cli-command-develop",
        create({ yargs, context }) {
            yargs.example("$0 develop api");

            yargs.command(
                "develop <folder>",
                `Start local development server`,
                yargs => {
                    yargs.positional("folder", {
                        describe: `Stack to start`,
                        type: "string"
                    });
                },
                async argv => {
                    await require("./develop")({ ...argv, env: "local" }, context);
                }
            );
        }
    },
    ...require("./plugins")
];
