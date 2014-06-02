var util = require("util");
var EventEmitter = require("events").EventEmitter;

function Peer(buoy, conn) {
    this.buoy = buoy;
    this.conn = conn;
    this.room = null;
    this.name = "Anon";
    this.gravatar = null;
    this.vote = 0;

    // All events peers can send to the signaling server are here
    this.on("ping", this.onPing);
    this.on("sendTo", this.onSendTo);
    this.on("joinRoom", this.onJoinRoom);
    this.on("leaveRoom", this.onLeaveRoom);
    this.on("sendChat", this.onSendChat);
    this.on("setName", this.onSetName);
    this.on("requestDJ", this.onRequestDJ);
    this.on("quitDJ", this.onQuitDJ);
    this.on("setGravatar", this.onSetGravatar);
    this.on("setActiveTrack", this.onSetActiveTrack);
    this.on("setActiveTrackDuration", this.onSetActiveTrackDuration);
    this.on("skip", this.onSkip);
    this.on("setVote", this.onSetVote);

    // Bind some methods so we can remove them in cleanUp
    this.onBuoyNewRoom = this.onBuoyNewRoom.bind(this);
    this.onBuoyDeleteRoom = this.onBuoyDeleteRoom.bind(this);

    // Listen to certain events from the buoy
    this.buoy.on("newRoom", this.onBuoyNewRoom);
    this.buoy.on("deleteRoom", this.onBuoyDeleteRoom);
}

util.inherits(Peer, EventEmitter);

/*
 * Cleans up the peer after it disconnects from the server
 */
Peer.prototype.cleanUp = function() {
    if(this.room) {
        this.room.leave(this);
    }
    this.buoy.removeListener("newRoom", this.onBuoyNewRoom);
    this.buoy.removeListener("deleteRoom", this.onBuoyDeleteRoom);
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
    this.name = data.name;
    console.log("[debug] "+ this.id +" now known as "+ data.name);
    if(!this.room) return;
    this.room.sendAllBut(this, "setName", {
        peer: this.id,
        name: data.name
    });
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
 */
Peer.prototype.onJoinRoom = function(data) {
    var room = this.buoy.getRoom(data.roomName);
    this.room = room;

    room.join(this);
    console.log("[debug] "+ this.name +" joined "+ room.name);
}

/*
 * Leaves a room
 * Expects:
 *  nada
 */
Peer.prototype.onLeaveRoom = function(data) {
    if(!this.room) return;

    this.room.leave(this);
}


/*
 * Handles a request to become DJ
 * Expects:
 *  track: object containing artist, album, and title attrs
 */
Peer.prototype.onRequestDJ = function(data) {
    if(!this.room) return;
    this.room.addDJ(this);
};

/*
 * Handles a request to quit DJing
 * Expects:
 *  nothing
 */
Peer.prototype.onQuitDJ = function() {
    if(!this.room) return;
    this.room.removeDJ(this);
};

/*
 * Handles a request to set the user's gravatar
 * Expects:
 *  gravatar: Gravatar md5 hash
 */
Peer.prototype.onSetGravatar = function(data) {
    this.gravatar = data.gravatar;

    if (!this.room) return;
    this.room.sendAllBut(this, "setGravatar", {
        peer: this.id,
        gravatar: this.gravatar
    });
}

/*
 * Handles a request to set the room's active track
 * Expects:
 *  track: object containing artist, album, and title attrs
 */
Peer.prototype.onSetActiveTrack = function(data) {
    if(!this.room || this.room.getActiveDJ() != this || !data.track) return;
    this.room.setActiveTrack(data.track);
};

/*
 * Handles a request to set the duration of the room's active track
 * Should be called once by the DJ.
 * Expects:
 *  duration: number in ms of duration of active track
 */
Peer.prototype.onSetActiveTrackDuration = function(data) {
    if(!this.room || this.room.getActiveDJ() != this || !data.duration) return;
    this.room.setActiveTrackDuration(data.duration);
};

/*
 * Handles the end of a DJ's segment, because they skipped it, or track ended
 * Expects nada
 */
Peer.prototype.onSkip = function() {
    if(!this.room || this.room.getActiveDJ() != this) return;
    this.room.skip();
};

/*
 * Triggered when the user votes on the currently active track
 * Expects:
 *  vote: -1, 0, 1 (down, neutral, up)
 */
Peer.prototype.onSetVote = function(data) {
    if(!this.room.activeTrack) return;

    var incYes = 0,
        incNo  = 0;

    if(data.vote > 0) {
        incYes = 1;
        if(this.vote != 0) incNo = -1;
    } else if(data.vote < 0) {
        incNo = 1;
        if(this.vote != 0) incYes = -1;
    }
    
    this.vote = data.vote < 0 ? -1 : data.vote > 0 ? 1 : 0;

    console.log("[room:"+ this.room.name +"] "+ this.name +" voted "+ this.vote);
    this.room.sendAllBut(this, "setVote", {
        peer: this.id,
        vote: this.vote
    });
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
