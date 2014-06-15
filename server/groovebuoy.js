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

http_server.listen(8844, function() {
    console.log("Server active on port 8844");
});

var ws_server = new WebsocketServer({
    httpServer: http_server,
    autoAcceptConnections: false,
});

var buoy = new Buoy(ws_server);
