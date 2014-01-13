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

    var peers = [];
    for(var i in this.peers) {
        peers.push(this.peers[i].id);
    }

    this.sendAll("peerJoined", {
        id: peer.id,
    });

    peer.send("roomData", {
        name: this.name,
        peers: peers,
    });
}

Room.prototype.sendAll = function(event, data) {
    for(var i in this.peers) {
        this.peers[i].send(event, data);
    }
}

exports.Room = Room;
