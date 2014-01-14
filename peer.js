var util = require("util");
var EventEmitter = require("events").EventEmitter;

function Peer(buoy, conn) {
    this.buoy = buoy;
    this.conn = conn;
    this.room = null;

    // All events peers can send to the signaling server are here
    this.on("ping", this.onPing);
    this.on("sendTo", this.onSendTo);
    this.on("joinRoom", this.onJoinRoom);
}

util.inherits(Peer, EventEmitter);

/*
 * Cleans up the peer after it disconnects from the server
 */
Peer.prototype.cleanUp = function() {
    if(this.room) {
        this.room.leave(this);
    }
}

/*
 * Sends data to this peer
 */
Peer.prototype.send = function(event, data) {
    if(!data) {
        data = {};
    }

    var send = { e: event };
    for(var key in data) {
        send[key] = data[key];
    }

    this.conn.sendJSON(send);
}

/*
 * Pings the server
 * Expects nothing!
 */
Peer.prototype.onPing = function(data) {
    this.send("pong");
}

/*
 * Sends a message to another peer
 * Expects:
 *  to - uuid of peer to send message to
 *  msg - object with the data to send
 */
Peer.prototype.onSendTo = function(data) {
    this.buoy.sendPeer(data.to, "recvMessage", {
        from: this.id,
        msg: data.msg,
    });
}

/*
 * Creates/joins a room.
 * Expects:
 *  name - The name of the room
 */
Peer.prototype.onJoinRoom = function(data) {
    var room = this.buoy.getRoom(data.name);
    room.join(this);
    this.room = room;
}

exports.Peer = Peer;
