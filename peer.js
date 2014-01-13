var util = require("util");
var EventEmitter = require("events").EventEmitter;

function Peer(conn) {
    this.conn = conn;
    this.on("ping", this.ping);
}

util.inherits(Peer, EventEmitter);

Peer.prototype.ping = function(data) {
    this.conn.sendJSON({
        e: "pong",
    });
}

exports.Peer = Peer;
