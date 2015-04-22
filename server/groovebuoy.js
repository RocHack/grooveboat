var WebsocketServer = require("websocket").server;
var WebsocketConnection = require("websocket").connection;
var http = require("http");
var Buoy = require("./buoy").Buoy;
var staticServer = require("./static");

// Extend the WebSocketConnection prototype to allow easy JSON
WebsocketConnection.prototype.sendJSON = function(send) {
    send = JSON.stringify(send);
    this.sendUTF(send);
}

var http_server = http.createServer(staticServer);
var port = process.env.PORT || 8844;

http_server.listen(port, function() {
    console.log("Server active on port", port);
});

var ws_server = new WebsocketServer({
    httpServer: http_server,
    autoAcceptConnections: false,
});

var buoy = new Buoy(ws_server);
