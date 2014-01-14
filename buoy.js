var util = require("util");
var uuid = require("node-uuid");
var EventEmitter = require("events").EventEmitter;
var Peer = require("./peer").Peer;
var Room = require("./room").Room;

function Buoy(server) {
    var self = this;
    this.svr = server;
    this.peers = {};
    this.rooms = {};

    this.svr.on("request", function(req) {
        var conn = req.accept("groovebuoy-0.1", req.origin);
        var pid = uuid.v1();
        console.log("[debug] Peer "+ pid +" connected");
        var peer = new Peer(self, conn);
        peer.id = pid;
        self.peers[pid] = peer;

        // Give the peer some info
        peer.send("welcome", {
            id: pid,
        });

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
            if(self.peers[pid]) {
                self.peers[pid].cleanUp();
                delete self.peers[pid];
                console.log("[debug] Peer "+ pid +" disconnected");
            } else {
                console.log("[error] Invalid client "+ pid +" disconnected");
            }
        });
    });
}

util.inherits(Buoy, EventEmitter);

/*
 * Sends a message to a peer with the given ID
 */
Buoy.prototype.sendPeer = function(id, event, data) {
    var peer = this.peers[id];
    if(!peer) return;

    peer.send(event, data);
}

/*
 * Gets a room given its name. It will create this room if it does not
 * exist.
 */
Buoy.prototype.getRoom = function(name) {
    var room = this.rooms[name];
    if(!room) {
        room = new Room(this, name);
        this.rooms[name] = room;
    }

    return room;
}

exports.Buoy = Buoy;
