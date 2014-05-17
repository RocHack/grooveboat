var util = require("util");
var EventEmitter = require("events").EventEmitter;

function Room(buoy, name) {
    this.buoy = buoy;
    this.name = name;
    this.peers = [];

    console.log("[debug] Creating new room "+ name);
}

util.inherits(Room, EventEmitter);

/*
 * Peer object serialization
 */
function peerToIdName(peer) {
    return {
        id: peer.id,
        name: peer.name
    };
}

function peerToId(peer) {
    return peer.id;
}

/*
 * Adds a peer to the room
 */
Room.prototype.join = function(peer) {
    this.peers.push(peer);

    this.sendAllBut(peer.id, "peerJoined", peerToIdName(peer));

    peer.send("roomData", {
        name: this.name,
        peers: this.peers.map(peerToIdName),
    });
};

/*
 * Removes a peer from the room
 */
Room.prototype.leave = function(peer) {
    var i = this.peers.indexOf(peer);
    this.peers.splice(i, 1);

    console.log("[debug] "+ peer.name +" left "+ this.name);

    // If the last peer left, delete the room
    if(this.peers.length == 0) {
        this.buoy.deleteRoom(this.name);
        return;
    }

    this.sendAllBut(peer.id, "peerLeft", {
        id: peer.id
    });
}

/*
 * Sends out a chat to all users
 */
Room.prototype.sendChat = function(from, message) {
    this.sendAllBut(from.id, "chat", { msg: message, from: from.id });
}

/*
 * Sends a message to all peers in the room
 */
Room.prototype.sendAll = function(event, data) {
    for(var i = 0; i < this.peers.length; i++) {
        this.peers[i].send(event, data);
    }
}

/*
 * Sends a message to all peers except for the given ID
 */
Room.prototype.sendAllBut = function(but, event, data) {
    for(var i = 0; i < this.peers.length; i++) {
        if(this.peers[i].id == but) continue;
        this.peers[i].send(event, data);
    }
}

exports.Room = Room;
