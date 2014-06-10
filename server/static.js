// Simple static webserver

var fs = require("fs");
var path = require("path");
var url = require("url");

var mimes = {
    ".html": "text/html",
    ".css":  "text/css",
    ".js":   "text/javascript",
    ".woff": "font/woff",
    ".ttf":  "font/ttf",
    ".png":  "image.png"
};

function serveFile(filename, resp) {
    var contentType = mimes[path.extname(filename)] || "text/plain";
    resp.setHeader("Content-Type", contentType);
    fs.createReadStream(filename)
        .on("error", function(err) {
            if (err.code == "ENOENT") {
                resp.writeHead(404);
                resp.write("404 Not Found\n");
            } else if (err.code == "EISDIR") {
                resp.writeHead(403);
                resp.write("403 Forbidden\n");
            } else {
                resp.writeHead(500);
                resp.write(err + "\n");
                console.error("Error serving file", filename, err);
            }
            resp.end();
        })
        .pipe(resp);
}

module.exports = function(request, response) {
    var uri = decodeURIComponent(url.parse(request.url).pathname.substr(1));
    if (uri.indexOf("static/") === 0) {
        serveFile(uri, response);
    } else {
        // Serve site on non-existent pages, so the client can handle routing.
        serveFile("index.html", response);
    }
};
