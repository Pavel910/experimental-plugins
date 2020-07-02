const { Graph, alg } = require("graphlib");
const traverse = require("traverse");
const indentString = require("indent-string");

const indent = num => {
    const original = console.log;
    console.log = (first, ...args) => {
        if (typeof first === "string") {
            original(indentString(first, num), ...args);
        } else {
            original(first, ...args);
        }
    };
    return () => (console.log = original);
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

                    if (!template[topLevelProp].component && !template[topLevelProp].deploy) {
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

const createGraph = allComponents => {
    const graph = new Graph();

    for (const resource in allComponents) {
        graph.setNode(resource, allComponents[resource]);
    }

    for (const resource in allComponents) {
        const { dependencies } = allComponents[resource];
        if (dependencies.length) {
            for (const dependency of dependencies) {
                graph.setEdge(resource, dependency);
            }
        }
    }

    validateGraph(graph);

    return graph;
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
                    const referencedComponent = match.substring(2, match.length - 1).split(".")[0];

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

const getAllComponents = (obj = {}) => {
    const allComponents = {};

    for (const key in obj) {
        const component = getDeployableComponent(obj[key]);
        if (component) {
            let componentPath = component.component;
            if (componentPath.startsWith(".")) {
                componentPath = join(process.cwd(), componentPath);
            }

            allComponents[key] = {
                name: key,
                component: component.component,
                inputs: component.inputs || {},
                build: obj[key].build || false,
                watch: obj[key].watch || false
            };
        }
    }

    return allComponents;
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

const executeGraph = async ({ graph, stack, resources }, context) => {
    let leaves = graph.sinks();

    while (leaves.length) {
        for (const resource of leaves) {
            const node = graph.node(resource);

            const plugin = context.plugins
                .byType("cli-develop-resource")
                .filter(pl => pl.component === node.component)
                .pop();

            if (!plugin) {
                graph.removeNode(resource);
                continue;
            }

            console.log(`Running "${node.name}"`);
            const unindent = indent(2);
            await plugin.run({ stack, resource: node, resources }, context);
            unindent();

            graph.removeNode(resource);
        }

        leaves = graph.sinks();
    }
};

module.exports = {
    createGraph,
    executeGraph,
    getAllComponents,
    validateGraph,
    setDependencies,
    resolveTemplate
};
