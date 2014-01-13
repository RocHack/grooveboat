var util = require("util");
var EventEmitter = require("events").EventEmitter;

function Peer(srv, conn) {
    this.srv = srv;
    this.conn = conn;

    // All events peers can send to the signaling server are here
    this.on("ping", this.onPing);
    this.on("sendTo", this.onPing);
}

util.inherits(Peer, EventEmitter);

Peer.prototype.onPing = function(data) {
    this.conn.sendJSON({
        e: "pong",
    });
}

Peer.prototype.sendTo = function(data) {
    var peer = this.srv.peers[data.to];
    if(!peer) {
        return;
    }

    peer.conn.sendJSON({
        e: "recvMessage",
        from: this.id,
        msg: data.msg,
    });
}

exports.Peer = Peer;
