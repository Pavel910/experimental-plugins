module.exports = {
  type: "cli-develop-resource",
  component: "@webiny/serverless-aws-s3",
  async run({ resource }, context) {
    console.log(`> Setup S3 container`);
    const getPort = require("get-port");
    const port = await getPort();

    const Docker = require("dockerode");
    const docker = new Docker();

    const container = await docker.createContainer({
      Image: "motoserver/moto",
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ["s3"],
      HostConfig: {
        PortBindings: {
          "5000/tcp": [
            {
              HostPort: String(port),
            },
          ],
        },
      },
    });

    const containerId = container.id.substring(0, 12);

    return new Promise((resolve) => {
      context.onExit(async () => {
        console.log(`Stopping S3: ${containerId}`);
        try {
          await container.stop();
        } catch (err) {
          console.log(err.message);
        }
      });

      container.start(function (err, data) {
        if (err) {
          throw err;
        }
        console.log("> Started S3 container:", containerId);
        resolve();
      });
    });
  },
};
