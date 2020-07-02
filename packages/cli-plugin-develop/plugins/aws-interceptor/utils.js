const { URL } = require("url");
const shimmer = require("shimmer");
const http = require("http");
const https = require("https");

module.exports.interceptAwsCalls = (onEvent) => {
  const lowerCaseObjectKeys = (obj) => {
    if (obj) {
      Object.keys(obj).reduce((c, k) => ((c[k.toLowerCase()] = obj[k]), c), {});
    }

    return {};
  };

  const getHostFromOptionsOrUrl = (options, url) => {
    if (url) {
      return new URL(url).hostname;
    }
    return options.hostname || options.host || (options.uri && options.uri.hostname) || "localhost";
  };

  const parseHttpRequestOptions = (options = {}, url) => {
    const host = getHostFromOptionsOrUrl(options, url);
    const agent = options.agent || options._defaultAgent;

    let path = null;
    let port = null;
    let protocol = null;

    let { headers, method = "GET" } = options;
    const sendTime = new Date().getTime();

    if (url) {
      const myUrl = new URL(url);
      ({ pathname: path, port, protocol } = myUrl);
    } else {
      path = options.path || "/";
      port = options.port || options.defaultPort || (agent && agent.defaultPort) || 80;
      protocol = options.protocol || (port === 443 && "https:") || "http:";
    }

    const uri = `${host}${path}`;

    return {
      path,
      port,
      uri,
      host,
      body: "", // XXX Filled by the httpRequestEndWrapper ( / Write)
      method,
      headers: lowerCaseObjectKeys(headers),
      protocol,
      sendTime,
    };
  };

  // http/s.request can be called with either (options, callback) or (url, options, callback)
  // See: https://github.com/nodejs/node/blob/01b404f629d91af8a720c51e90895bf0c07b0d6d/lib/_http_client.js#L76
  const httpRequestArguments = (args) => {
    if (args.length === 0) {
      throw new Error("http/s.request(...) was called without any arguments.");
    }

    let url = undefined;
    let options = undefined;
    let callback = undefined;

    if (typeof args[0] === "string") {
      url = args[0];
      if (args[1]) {
        if (typeof args[1] === "function") {
          callback = args[1];
        } else {
          options = args[1];
        }
        if (typeof args[2] === "function") {
          callback = args[2];
        }
      }
    } else {
      options = args[0];
      if (typeof args[1] === "function") {
        callback = args[1];
      }
    }
    return { url, options, callback };
  };

  const httpRequestEndWrapper = (requestData) => () =>
    function (data) {
      data && (requestData.body += data);
      onEvent(requestData);
      // Once we have the full request data, we can destroy the request and process it via plugins.
      this.destroy();
    };

  const httpRequestWrapper = (originalRequestFn) =>
    function (...args) {
      let url, options, callback;
      try {
        ({ url, options, callback } = httpRequestArguments(args));
      } catch (err) {
        console.warn("request parsing error", err);
      }

      try {
        const requestData = parseHttpRequestOptions(options, url);
        const clientRequest = originalRequestFn.apply(this, [url, options, callback]);

        try {
          const endWrapper = httpRequestEndWrapper(requestData);
          shimmer.wrap(clientRequest, "end", endWrapper);
        } catch (e) {
          console.warn("end wrap error", e.message);
        }

        return clientRequest;
      } catch (err) {
        console.warn("httpRequestWrapper", err.message);
        return originalRequestFn.apply(this, args);
      }
    };

  const httpGetWrapper = (httpModule) => () => {
    return function (...args) {
      const req = httpModule.request(...args);
      req.end();
      return req;
    };
  };

  shimmer.wrap(http, "get", httpGetWrapper(http));
  shimmer.wrap(https, "get", httpGetWrapper(https));
  shimmer.wrap(http, "request", httpRequestWrapper);
  shimmer.wrap(https, "request", httpRequestWrapper);
};
