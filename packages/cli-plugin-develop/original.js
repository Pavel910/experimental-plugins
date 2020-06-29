/* eslint-disable */
const express = require("express")
const bodyParser = require("body-parser")
const chalk = require("chalk")
const fs = require("fs")
const path = require("path")
const sanitizeFilename = require("sanitize-filename")
const dotenvJSON = require("dotenv-json")

const expressToLambda = req => {
    const event = {
        headers: req.headers,
        path: req.path,
        resource: req.path,
        httpMethod: req.method,
        queryStringParameters: req.query,
        pathParameters: req.params,
        requestContext: {
            identity: {
                userAgent: req.headers["user-agent"],
            },
            httpMethod: req.method,
        },
    }

    if (event.headers["content-type"] === "application/json") {
        event.body = JSON.stringify(req.body)
    }

    return event
}

const handlers = {}
const executeHandler = async (dir, req, res, file = "handler", ctx = {}) => {
    if (file === "handler") {
        dotenvJSON({ path: dir + "/.env.json" })

        if (process.env.NODE_ENV === "production") {
            dir += "/build"
        }
    }

    file = dir + "/" + file
    const handler = handlers[file] || (handlers[file] = require(file).handler)
    const result = await handler(expressToLambda(req), ctx)

    res.set(result.headers)
    res.status(result.statusCode).send(result.body)
}

const app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ limit: "25mb", extended: true }))

// OPTIONS
app.options("*", async (req, res) => {
    res
        .set({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        })
        .status(200)
        .send()
})

// GET /files/*
app.get("/files/:key", async (req, res) =>
    executeHandler("./files", req, res, "download")
)

// POST /files/upload
app.post("/files/upload", async (req, res) =>
    executeHandler("./files", req, res, "upload", { req })
)

// POST /files
app.post("/files", async (req, res) =>
    executeHandler("./files", req, res, "uploadRequest")
)

// ANY /graphql/*
app.all("/graphql/:service?", async (req, res) => {
    const service = sanitizeFilename(req.params.service || "gateway")
    const dir = path.resolve(__dirname, "../.webiny", service)

    if (!fs.existsSync(dir)) {
        res.status(404).send()
    } else {
        executeHandler(dir, req, res)
    }
})

const port = process.env.PORT || 9000
app.listen(port, () => {
    console.log(
        `${chalk.cyan(`🚀 Functions running on port ${port}...`)} ${chalk.grey(
            "(Hit Ctrl+C to abort)"
        )}`
    )
})
