var util = require("util");
var EventEmitter = require("events").EventEmitter;

var MAX_DJS = 5;

function Room(buoy, name) {
    this.buoy = buoy;
    this.name = name;
    this.peers = [];
    this.djs = [];
    this.activeDJ = -1; // Val is an index in this.djs
    this.activeTrack = null;
    this.trackStartTime = null;

    console.log("[debug] Creating new room "+ name);
}

util.inherits(Room, EventEmitter);

/*
 * Peer object serialization
 */
function peerData(peer) {
    return {
        id: peer.id,
        name: peer.name,
        gravatar: peer.gravatar,
        votes: peer.vote
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

    this.sendAllBut(peer, "peerJoined", peerData(peer));

    peer.send("roomData", {
        name: this.name,
        peers: this.peers.map(peerData),
        djs: this.djs.map(peerToId),
        activeDJ: this.activeDJ,
        activeTrack: this.activeTrack,
        currentTime: this.getCurrentTime()
    });
};

/*
 * Removes a peer from the room
 */
Room.prototype.leave = function(peer) {
    var i = this.peers.indexOf(peer);
    if (i == -1) return;
    this.peers.splice(i, 1);

    console.log("[debug] "+ peer.name +" left "+ this.name);

    this.removeDJ(peer);

    // If the last peer left, delete the room
    if(this.peers.length == 0) {
        this.buoy.deleteRoom(this.name);
        return;
    }

    this.sendAllBut(peer, "peerLeft", {
        id: peer.id
    });
}

/*
 * Sends out a chat to all users
 */
Room.prototype.sendChat = function(from, message) {
    this.sendAllBut(from, "chat", { msg: message, from: from.id });
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
        if(this.peers[i] == but) continue;
        this.peers[i].send(event, data);
    }
}

/*
 * Adds a peer to the DJ list
 */
Room.prototype.addDJ = function(peer) {
    if (this.djs.indexOf(peer) != -1) return;

    if(this.djs.length >= MAX_DJS) {
        return false;
    }
    
    this.djs.push(peer);

    // Notify peers
    this.sendAll("newDJ", {
        id: peer.id
    });

    if(this.djs.length == 1) {
        this.setActiveDJ(peer);
    }
};

/*
 * Removes a user from the DJ list
 */
Room.prototype.removeDJ = function(peer) {
    var i = this.djs.indexOf(peer);
    if (i == -1) return;
    this.djs.splice(i, 1);

    // Notify peers
    this.sendAll("removeDJ", {
        id: peer.id
    });

    if(this.activeDJ == i) {
        this.skip();
    } else if(this.activeDJ > i) {
        this.activeDJ--;
    }
};

/*
 * Sets the given peer to the active DJ of the room
 */
Room.prototype.setActiveDJ = function(peer) {
    var i = this.djs.indexOf(peer);
    this.activeDJ = i;
    this.sendAll("setActiveDJ", {
        peer: i == -1 ? null : peer.id,
    });
};

/*
 * Skip the active DJ and their track
 */
Room.prototype.skip = function() {
    var nextDJ = this.djs[this.activeDJ + 1] || this.djs[0];
    if (this._skipTimer) return;
    this.setActiveTrack(null);

    // insert a delay between DJ repeating a play,
    // to avoid race condition in RTC signalling
    if (nextDJ && nextDJ == this.getActiveDJ()) {
        this.setActiveDJ(null);
        this._skipTimer = setTimeout(function() {
            this._skipTimer = null;
            this.skip();
        }.bind(this), 250);
    } else {
        this.setActiveDJ(nextDJ);
    }
};

/*
 * Get the current DJ of the room
 */
Room.prototype.getActiveDJ = function() {
    return this.djs[this.activeDJ];
};

/*
 * Sets the active track of the room
 */
Room.prototype.setActiveTrack = function(track) {
    if (!track) {
        // if the track is being cleared, clear the start time
        this.trackStartTime = null;
    } else if (!this.activeTrack) {
        // if this is a new track, reset the start time
        this.trackStartTime = new Date();
    }

    this.activeTrack = track;
    this.sendAll("setActiveTrack", {
        track: track
    });

    // Reset user votes
    this.peers.forEach(function(peer) {
        peer.vote = 0;
    });
};

/*
 * Sets the duration (ms) of the active track of the room
 */
Room.prototype.setActiveTrackDuration = function(duration) {
    if (!this.activeTrack) {
        console.error("Got active track duration without active track");
        return;
    }

    this.activeTrack.duration = duration;
    this.sendAll("setDuration", {
        duration: duration
    });
};

/*
 * Gets the time (ms) into the current track
 * Returns null if there is no current track or start time is unknown
 */
Room.prototype.getCurrentTime = function() {
    return this.trackStartTime && (new Date() - this.trackStartTime);
};

exports.Room = Room;
