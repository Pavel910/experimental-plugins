module.exports.expressToLambda = function(req) {
    const event = {
        headers: req.headers,
        path: req.path,
        resource: req.path,
        httpMethod: req.method,
        queryStringParameters: req.query,
        pathParameters: req.params,
        requestContext: {
            identity: {
                userAgent: req.headers["user-agent"]
            },
            httpMethod: req.method
        }
    };

    if (event.headers["content-type"] === "application/json") {
        event.body = JSON.stringify(req.body);
    }

    return event;
};
