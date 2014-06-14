var Emitter = require('wildemitter');
var md5 = require('md5-jkmyers');
var AudioMetadata = require('audio-metadata');
var ID3v2 = require('./lib/id3v2');
var User = require('./user');
var Buoy = require('./buoy');
var GrooveDB = require('./groovedb');
var Player = require('./player');

// turn track into object suitable for transmission
function exportTrack(t) {
    return t && {
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration
    };
}

function Groove() {
    Emitter.call(this);

    this.rooms = [];
    this.users = {};
    this.djs = [];
    this.activeDJ = null;

    this.me = new User(this);
    this.me.isLocal = true;
    this.me.on('gravatar', this._onSetGravatar.bind(this));
    this.me.on('name', this._onSetName.bind(this));

    this.playlists = {default: []};
    this.activePlaylist = 'default';
    this.activeTrack = null;
    this.trackClock = null;
    this.trackStartTime = -1;
    this.persist = false;
    this.db = new GrooveDB();
    this.getPersistTracks();
    this.player = new Player();

    // get stats about incoming peer connection from DJ
    this.statsTimestamp = 0;
    this.incomingBytes = 0;
    setInterval(Groove_getStats.bind(this,
        Groove_gotStats.bind(this)), 5000);
}

Groove.prototype = Object.create(Emitter.prototype, {
    constructor: {value: Groove}
});

/*
* Update the clock
*/
function Groove_clock() {
    // let the UI update the current track time
    this.emit("currentTrackTime");
}

/*
* Connects to a buoy server and instantiates this.buoy
*/
Groove.prototype.connectToBuoy = function(url) {
    this.buoy = new Buoy(url);

    // Setup buoy events
    this.buoy.on("welcome", this.onBuoyWelcome.bind(this));
    this.buoy.on("newRoom", this.onBuoyNewRoom.bind(this));
    this.buoy.on("deleteRoom", this.onBuoyDeleteRoom.bind(this));
    this.buoy.on("chat", this.onBuoyChat.bind(this));
    this.buoy.on("peerJoined", this.onBuoyPeerJoined.bind(this));
    this.buoy.on("peerLeft", this.onBuoyPeerLeft.bind(this));
    this.buoy.on("roomData", this.onBuoyRoomData.bind(this));
    this.buoy.on("recvMessage", this.onBuoyRecvMessage.bind(this));
    this.buoy.on("newDJ", this.onBuoyNewDJ.bind(this));
    this.buoy.on("removeDJ", this.onBuoyRemoveDJ.bind(this));
    this.buoy.on("setActiveDJ", this.onBuoySetActiveDJ.bind(this));
    this.buoy.on("setActiveTrack", this.onBuoySetActiveTrack.bind(this));
    this.buoy.on("setDuration", this.onBuoySetDuration.bind(this));
    this.buoy.on("setName", this.onBuoySetName.bind(this));
    this.buoy.on("setGravatar", this.onBuoySetGravatar.bind(this));
    this.buoy.on("setVote", this.onBuoySetVote.bind(this));
    this.buoy.on("reconnected", this.emit.bind(this, "reconnected"));
};

Groove.prototype.onBuoyWelcome = function(data) {
    console.log("Assigned PID: "+ data.id);
    this.me.id = data.id;

    this.rooms.length = 0;
    for(var i in data.rooms) {
        this.rooms.push(data.rooms[i]);
    }
    this.emit('welcome');
    this.emit('roomsChanged');
};

Groove.prototype.onBuoyNewRoom = function(data) {
    this.rooms.push(data.name);
    this.emit('roomsChanged');
};

Groove.prototype.onBuoyDeleteRoom = function(data) {
    var i = this.rooms.indexOf(data.name);
    if(i == -1) return;
    this.rooms.splice(i, 1);
    this.emit('roomsChanged');
};

Groove.prototype.onBuoyChat = function(data) {
    this.emit('chat', {
        text: String(data.msg),
        from: this.users[data.from]
    });
};

Groove.prototype.onBuoyRoomData = function(data) {
    // get peer data
    this.users = {};
    for(var i = 0; i < data.peers.length; i++) {
        var peer = data.peers[i];

        if(this.me.id == peer.id) continue;

        var user = new User(this, peer.id);
        user.name = peer.name;
        user.setGravatar(peer.gravatar);
        user.setVote(peer.vote);

        this.users[user.id] = user;
        this.emit('peerConnected', user);
    }

    this.users[this.me.id] = this.me;

    // get DJs
    var djs = [];
    for (i = 0; i < data.djs.length; i++) {
        var dj = this.users[data.djs[i]];
        if (!dj) {
            console.error("Unknown DJ", data.djs[i]);
            continue;
        }
        dj.dj = true;
        djs.push(dj);
    }
    this.djs = djs;

    // get active track and DJ
    var trackStartTime = data.currentTime ?
        new Date().getTime() - data.currentTime : -1;
    this._setActiveTrack(data.activeTrack, trackStartTime);
    this.activeDJ = this.djs[data.activeDJ];
    if (this.activeDJ) {
        // prepare to receive track stream
        this.activeDJ.preparePeerConnection();
    }
    this.emit("djs");
    this.emit("activeDJ");
    this.emit("activeTrack");
    if (this.activeTrack) {
        this.emit("activeTrackDuration");
    }
};

Groove.prototype.onBuoyRecvMessage = function(data) {
    var user = this.users[data.from];
    if (!user) {
        console.error("Received message from unknown user " + data.from, data);
        return;
    }
    user.handleMessage(data.msg);
};

Groove.prototype.onBuoyPeerLeft = function(data) {
    var user = this.users[data.id];
    user.emit("disconnected");
    this.emit("peerDisconnected", user);

    console.log("User "+ user.name +" disconnected");

    delete this.users[data.id];
};

Groove.prototype.onBuoyPeerJoined = function(data) {
    var user = this.users[data.id] = new User(this, data.id);
    user.name = data.name;
    user.setGravatar(data.gravatar);

    this.emit('peerConnected', user);
    console.log("User "+ user.name +" joined");

    if (this.activeDJ == this.me) {
        this.streamToPeer(user);
    }
};

Groove.prototype.onBuoyNewDJ = function(data) {
    var user = this.users[data.id];
    if (!user) {
        console.error("Unknown user", data.id);
        console.log(this.users);
        return;
    }
    this._onDJStart(user);
};

Groove.prototype.onBuoyRemoveDJ = function(data) {
    var user = this.users[data.id];
    if (!user) {
        console.error("Unknown user", data.id);
        return;
    }
    this._onDJQuit(user);
};

Groove.prototype.onBuoySetActiveDJ = function(data) {
    this.activeDJ = this.users[data.peer];
    if (this.activeDJ == this.me) {
        this.becomeActiveDJ();
    } else if (this.activeDJ) {
        // prepare to receive track stream
        this.activeDJ.preparePeerConnection();
    }
    // todo: cleanup old DJ peer connection or stream?

    this.emit("activeDJ");
};

Groove.prototype.onBuoySetActiveTrack = function(data) {
    // assume zero latency from DJ to server to us, for purposes of
    // computing start time
    var trackStartTime = new Date().getTime();
    this._setActiveTrack(data.track, trackStartTime);
    this.emit("activeTrack");
    // the active DJ will now stream the track to us
    // (unless we are the active DJ)

    for(var id in this.users) {
        var user = this.users[id];
        user.vote = 0;
        this.emit("setVote", user);
    }
};

Groove.prototype.onBuoySetDuration = function(data) {
    if (!this.activeTrack) {
        console.error("Got active track duration without active track");
        return;
    }
    this.activeTrack.duration = data.duration;
    this.emit("activeTrackDuration");
};

Groove.prototype.onBuoySetGravatar = function(data) {
    var user = this.users[data.peer];
    if(!user) return;
    user.setGravatar(data.gravatar);
};

Groove.prototype.onBuoySetVote = function(data) {
    this.users[data.peer].vote = data.vote;
    this.emit("setVote", this.users[data.peer]);
};

Groove.prototype.onBuoySetName = function(data) {
    var user = this.users[data.peer];
    if(!user) return;
    user.setName(data.name);
};

Groove.prototype.sendChat = function(text) {
    this.buoy.send("sendChat", {
        msg: text
    });
};

Groove.prototype.joinRoom = function(roomName) {
    this.roomName = roomName;
    this.me.vote = 0;
    this.buoy.send("joinRoom", { 
        roomName: roomName
    });
};

Groove.prototype.createRoom = function(roomName, cb) {
    var self = this;
    this.webrtc.createRoom(roomName, function(error, name) {
        if (error) {
            cb(false);
        } else {
            self.roomName = name;
            cb(true);
        }
    });
};

Groove.prototype.leaveRoom = function() {
    this.roomName = null;
    this.buoy.send("leaveRoom", {});
    if (this.activeDJ) {
        this.activeDJ.closePeerConnection();
        if (this.activeDJ == this.me) {
            this.activeDJ.dj = false;
            this.cleanupDJing();
        }
    }
    this._setActiveTrack(null, null);
    this.emit('activeTrack');
};

Groove.prototype._onSetGravatar = function() {
    this.buoy.send("setGravatar", {
        gravatar: this.me.gravatar
    });
};

Groove.prototype._onSetName = function() {
    this.buoy.send("setName", {
        name: this.me.name
    });
};

Groove.prototype.getVotes = function() {
    var yes = 0,
        no  = 0;
    for(var id in this.users) {
        var user = this.users[id];
        if(user.vote > 0) yes++;
        else if(user.vote < 0) no++;
    }

    return {
        yes: yes,
        no: no
    };
};

Groove.prototype.becomeDJ = function() {
    if (this.me.dj) {
        // already DJing
        return;
    }
    var playlist = this.playlists[this.activePlaylist];
    if (!playlist || !playlist.length) {
        this.emit('emptyPlaylist');
        return;
    }
    this.buoy.send('requestDJ', {});
};

Groove.prototype.becomeActiveDJ = function() {
    var track = this.getMyTrack();
    if (!track) {
        this.quitDJing();
    }

    console.log("set active track", track);
    this.buoy.send('setActiveTrack', {
        track: exportTrack(track)
    });

    // play our active track, and stream it to peers.
    this._playMyTrack();
};

Groove.prototype.quitDJing = function() {
    if (!this.me.dj) {
        return;
    }
    this.buoy.send('quitDJ', {});
    //setTimeout(this._onDJQuit.bind(this, this.me), 10);
};

Groove.prototype._onDJStart = function(user) {
    if (this.djs.indexOf(user) > -1) return;
    this.djs.push(user);
    console.log("DJ", user.name, "stepped up");
    user.dj = true;
    this.emit('djs', this.djs.slice());
};

Groove.prototype._onDJQuit = function(user) {
    console.log("DJ", user.name, "stepped down");
    var i = this.djs.indexOf(user);
    if (i == -1) return;
    this.djs.splice(i, 1);
    user.dj = false;

    if (this.activeDJ == user) {
        this.cleanupDJing();
    }
    this.emit('djs', this.djs.slice());
};

Groove.prototype.skip = function() {
    // yield to the next DJ
    this.buoy.send('skip', {});
    this.cleanupDJing();

    // Swap out songs
    var playlist = this.playlists[this.activePlaylist];
    if(playlist.length == 1) return;

    playlist.push(playlist.shift());
    setTimeout(function() {
        this.emit("playlistUpdated", this.activePlaylist);
    }.bind(this), 10);
};

// remove peer connection and stream to user
function Groove_removePeerStream(user) {
    user.removeStream(this.stream);
}

// clean up after no longer the active DJ
Groove.prototype.cleanupDJing = function() {
    this.activeDJ = null;
    this._setActiveTrack(null, null);
    this.player.stop();
    this.emit('activeDJ');
    this.emit('activeTrack');
    this.emit('activeTrackURL');
    if (this.stream) {
        this.getPeers().forEach(Groove_removePeerStream.bind(this));
    }
};

function parseAudioMetadata(file, cb) {
    var reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(e) {
        var buffer = e.target.result;
        if (file.type == 'audio/ogg') {
            var tags = AudioMetadata.ogg(buffer);
            cb({
                Title: tags.title,
                Artist: tags.artist,
                Album: tags.album
            });
        } else {
            ID3v2.parseFile(file, cb);
        }
        reader.onload = null;
    };
}

function grooveFileParsed(file, next, tags) {
    var track = {
        id: md5(file.name + file.size + file.type),
        file: file,
        title: tags.Title || 'Untitled',
        artist: tags.Artist || 'Unknown',
        album: tags.Album || 'Unknown',
    };

    var playlist = this.playlists[this.activePlaylist];
    playlist.push(track);

    track.playlistPosition = playlist.indexOf(track);

    if(this.persist) {
        this.db.storeTrack(track);
    }

    this.emit('playlistUpdated', this.activePlaylist);
    next();
}

function grooveProcessFile(files, i) {
    var file = files[i];
    if (!file) return;
    var next = grooveProcessFile.bind(this, files, i+1);

    if (file.type.indexOf('audio/') === 0 ||
        file.type.indexOf('video/') === 0) {
        parseAudioMetadata(file, grooveFileParsed.bind(this, file, next));
    } else {
        next();
    }
}

Groove.prototype.addFilesToQueue = function(files) {
    grooveProcessFile.call(this, files, 0);
};

Groove.prototype.setPersist = function(val) {
    if(val) {
        // TODO Make this support playlists
        var playlist = this.playlists[this.activePlaylist];
        playlist.forEach(this.db.storeTrack.bind(this.db));
    } else {
        // Before clearing db, make sure we have the track file objects,
        // in case the user still wants to play their tracks this pageload
        this.playlists[this.activePlaylist].forEach(function(track) {
            if (!track.file) {
                this.db.getTrackFile(track, function(file) {
                    track.file = file;
                });
            }
        }.bind(this));
        this.db.clearDb();
    }

    this.persist = val;
};

Groove.prototype._persistTracksCb = function(tracks) {
    tracks = tracks.sort(function(a, b) {
        if(a.playlistPosition > b.playlistPosition)
            return 1;
        else 
            return -1;
    });

    this.playlists[this.activePlaylist] = tracks;

    this.emit("playlistUpdated", this.activePlaylist);
};

Groove.prototype.getPersistTracks = function() {
    this.db.getTracks(this._persistTracksCb.bind(this));
};

Groove.prototype.savePlaylist = function(name) {
    if(!this.persist) return;

    var self = this;
    this.playlists[name].forEach(function(track) {
        self.db.storeTrack(track);
    });
};

Groove.prototype.setPlaylist = function(name, tracks) {
    tracks.forEach(function(track, i) {
        track.playlistPosition = i;
    });
    this.playlists[name] = tracks;
    this.savePlaylist(name);
};

Groove.prototype.deleteTrack = function(playlistName, track) {
    var playlist = this.playlists[playlistName];
    var i = playlist.indexOf(track);

    if(i == -1) return;
    playlist.splice(i, 1);

    if(this.persist) this.db.deleteTrack(track);
    this.emit("playlistUpdated", playlistName);
};

Groove.prototype.vote = function(direction) {
    this.me.setVote(direction);
    this.emit("setVote", this.me);

    this.buoy.send("setVote", {
        vote: this.me.vote
    });
};

// get our upcoming track (or active track, if we are the active DJ)
Groove.prototype.getMyTrack = function() {
    return this.playlists[this.activePlaylist][0];
};

// play my track locally, as the active DJ
Groove.prototype._playMyTrack = function() {
    var track = this.getMyTrack();
    if (track.file) {
        this._playFile(track.file);
    } else {
        this.db.getTrackFile(track, this._playFile.bind(this));
    }
};

// play a file object as audio, and stream it
Groove.prototype._playFile = function(file) {
    var reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(e) {
        this.player.audioContext.decodeAudioData(e.target.result,
            Groove_gotAudioData.bind(this));
    }.bind(this);
};

// local audio track finished playing
function Groove_onPlaybackEnded() {
    this.skip();
}

// handle audio data decoded from file.
// should be called by active DJ beginning to play track
function Groove_gotAudioData(buffer) {
    if (this.me != this.activeDJ || !this.activeTrack) return;

    // notify server about track duration
    this._setActiveTrackDuration(buffer.duration);

    // thanks to:
    // http://servicelab.org/2013/07/24/streaming-audio-between-browsers-with-webrtc-and-webaudio/

    // create an audio source and connect it to the file buffer
    var mediaSource = this.player.audioContext.createBufferSource();
    mediaSource.buffer = buffer;
    mediaSource.start(0);

    // handle end of playback
    mediaSource.onended = Groove_onPlaybackEnded.bind(this);

    // connect the audio stream to the audio hardware
    this.activeTrack.mediaSource = mediaSource;
    this.player.playTrack(this.activeTrack);
    this.emit('activeTrack');

    // create a destination for the remote browser
    var remote = this.player.audioContext.createMediaStreamDestination();

    // connect the remote destination to the source
    mediaSource.connect(remote);

    // send stream to peers
    this.stream = remote.stream;
    this.streamToPeers();
}

Groove.prototype.streamToPeer = function(user) {
    user.preparePeerConnection();
    // add the stream to the peer connection
    user.addStream(this.stream);
};

Groove.prototype.streamToPeers = function() {
    if (!this.stream) {
        console.error("No stream to send");
        return;
    }
    this.getPeers().forEach(this.streamToPeer.bind(this));
};

Groove.prototype._setActiveTrack = function(track, startTime) {
    this.activeTrack = track;
    if (this.trackClock) {
        clearInterval(this.trackClock);
    }
    if (track) {
        this.trackStartTime = startTime;
        this.trackClock = setInterval(Groove_clock.bind(this), 1000);
    } else {
        this.trackStartTime = -1;
        this.trackClock = null;
    }
    this.emit("currentTrackTime");
};

Groove.prototype._setActiveTrackDuration = function(duration) {
    var durationMs = duration * 1000;
    this.activeTrack.duration = durationMs;
    // notify server and everyone about duration of active track
    this.emit("activeTrackDuration");
    this.buoy.send("setActiveTrackDuration", {
        duration: durationMs
    });
};

Groove.prototype.getPeers = function() {
    var peers = [];
    for (var id in this.users) {
        var peer = this.users[id];
        if (peer && peer != this.me) {
            peers.push(peer);
        }
    }
    return peers;
};

// get stats for incoming peer connection
function Groove_getStats(cb) {
    var pc = this.activeDJ && this.activeDJ.pc;
    if (pc) pc.getStats(cb);
}

function statIsSrc(stat) {
    return stat.type == 'ssrc';
}

// analyze bitrate from peer connection stats
function Groove_gotStats(err, stats) {
    if (err) throw err;
    var stat = stats.filter(statIsSrc)[0];
    if (!stat) return;

    var bytesNow = stat.bytesReceived;
    if (this.statsTimestamp > 0) {
        var bitrate = Math.round((bytesNow - this.incomingBytes) * 8 /
            (stat.timestamp - this.statsTimestamp));
        var fractionLost = stat.packetsLost /
            (stat.packetsLost + stat.packetsReceived);

        if (bitrate > 0) {
            console.log('Bitrate: ' + bitrate + ' kbps.',
                'Packets lost: ' + Math.round(fractionLost * 100) + '%');
        }
    }

    this.statsTimestamp = stat.timestamp;
    this.incomingBytes = bytesNow;
}

// got a stream through WebRTC from the active DJ
Groove.prototype.gotRemoteStream = function(stream) {
    this.activeTrack.stream = stream;
    this.emit('activeTrack');
    this.player.playTrack(this.activeTrack);
};

// Get the current time (ms) in playback of the active track
Groove.prototype.getCurrentTrackTime = function() {
    return this.trackStartTime ?
        (new Date().getTime() - this.trackStartTime) : -1;
};

module.exports = Groove;
