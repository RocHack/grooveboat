var util = require("util");
var EventEmitter = require("events").EventEmitter;

function Peer(buoy, conn) {
    this.buoy = buoy;
    this.conn = conn;
    this.room = null;
    this.name = "Anon";

    // All events peers can send to the signaling server are here
    this.on("ping", this.onPing);
    this.on("sendTo", this.onSendTo);
    this.on("joinRoom", this.onJoinRoom);
    this.on("sendChat", this.onSendChat);
    this.on("setName", this.onSetName);

    // Listen to certain events from the buoy
    this.buoy.on("newRoom", this.onBuoyNewRoom.bind(this));
    this.buoy.on("deleteRoom", this.onBuoyDeleteRoom.bind(this));
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
 * Receives a chat message from the client and blasts it out
 * to all other clients
 * Expects:
 *  msg - The text of the chat message
 */
Peer.prototype.onSendChat = function(data) {
    if(!this.room) return;
    this.room.sendChat(this, data.msg);
}

/*
 * Changes a client's name and blasts it out to all others
 * Expects:
 *  name - The new name
 */
Peer.prototype.onSetName = function(data) {
    if(!this.room) return;
    this.name = data.name;
    this.room.sendAllBut(this, "changeName", { name: data.name });
    console.log("[debug] "+ this.id +" now known as "+ data.name);
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
 *  roomName - The name of the room
 *  peerName - The name of the peer joining the room
 */
Peer.prototype.onJoinRoom = function(data) {
    var room = this.buoy.getRoom(data.roomName);
    room.join(this);
    this.room = room;

    this.name = data.peerName;
    console.log("[debug] "+ this.name +" joined "+ room.name);
}

/*
 * Tell the peer when a room has been added
 */
Peer.prototype.onBuoyNewRoom = function(data) {
    this.send("newRoom", {
        name: data.room.name,
    });
}

/*
 * Tell the peer when a room has been deleted
 */
Peer.prototype.onBuoyDeleteRoom = function(data) {
    this.send("deleteRoom", {
        name: data.room,
    });
}

exports.Peer = Peer;
