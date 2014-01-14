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
 * Adds a peer to the room
 */
Room.prototype.join = function(peer) {
    this.peers.push(peer);

    // Generate an array of peer ids
    var peers = [];
    for(var i in this.peers) {
        peers.push(this.peers[i].id);
    }

    this.sendAllBut(peer.id, "peerJoined", {
        id: peer.id,
    });

    peer.send("roomData", {
        name: this.name,
        peers: peers,
    });
}

/*
 * Removes a peer from the room
 */
Room.prototype.leave = function(peer) {
    var i = this.peers.indexOf(peer);
    this.peers = this.peers.splice(i, 1);

    this.sendAll("peerLeft", {
        id: peer.id,
    });
}

/*
 * Sends a message to all peers in the room
 */
Room.prototype.sendAll = function(event, data) {
    for(var i in this.peers) {
        this.peers[i].send(event, data);
    }
}

/*
 * Sends a message to all peers except for the given ID
 */
Room.prototype.sendAllBut = function(but, event, data) {
    for(var i in this.peers) {
        if(this.peers[i].id == but) continue;
        this.peers[i].send(event, data);
    }
}

exports.Room = Room;
