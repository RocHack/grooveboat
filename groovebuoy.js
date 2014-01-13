var WebsocketServer = require("websocket").server;
var WebsocketConnection = require("websocket").connection;
var http = require("http");
var Peer = require("./peer").Peer;

// Extend the WebSocketConnection prototype to allow easy JSON
WebsocketConnection.prototype.sendJSON = function(send) {
    send = JSON.stringify(send);
    this.sendUTF(send);
}

var http_server = http.createServer(function(req, resp) {
    resp.writeHead(404);
    resp.end();
});

http_server.listen(8844, function() {
    console.log("Server active on port 8844");
});

var ws_server = new WebsocketServer({
    httpServer: http_server,
    autoAcceptConnections: false,
});

ws_server.on("request", function(req) {
    var conn = req.accept("groovebuoy-0.1", req.origin);
    console.log("[debug] Peer connected");
    var peer = new Peer(conn);

    conn.on("message", function(msg) {
        if(msg.type != "utf8") {
            conn.drop(conn.CLOSE_REASON_PROTOCOL_ERROR);
            console.log("[err] Received bad data");
            return;
        }

        try {
            msg = JSON.parse(msg.utf8Data);
        } catch(e) {
            conn.drop(conn.CLOSE_REASON_PROTOCOL_ERROR);
            console.log("[err] Received bad JSON data");
            return;
        }

        if(!msg['e']) {
            conn.drop(conn.CLOSE_REASON_PROTOCOL_ERROR);
            console.log("[err] Received bad object data");
        }

        peer.emit(msg['e'], msg);
    });

    conn.on("close", function() {
        console.log("[debug] Peer disconnected");
    });
});
