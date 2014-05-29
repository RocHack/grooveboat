(function () {

    // turn track into object suitable for transmission
    function exportTrack(t) {
        return t && {
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
        };
    }

    // create an object URL for a stream or file
    function createObjectUrl(stream) {
        var URL = window.URL || window.webkitURL;
        var url =
            window.createObjectURL ? window.createObjectURL(stream) :
            window.createBlobURL ? window.createBlobURL(stream) :
            URL && URL.createObjectURL ? URL.createObjectURL(stream) : null;
        if (!url) {
            throw new Error('Unable to make object URL for', stream);
        }
        return url;
    }

    var AudioContext = window.AudioContext || window.webkitAudioContext;

    function Groove() {
        var self = this;
        WildEmitter.call(this);

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
        this.persist = false;
        this.db = new GrooveDB();

        this.audioContext = new AudioContext();
        // gainNode control volume for local stream.
        // volume for incoming stream is set on the player object in RoomCtrl
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);

        // get stats about incoming peer connection from DJ
        this.statsTimestamp = 0;
        this.incomingBytes = 0;
        setInterval(Groove_getStats.bind(this,
            Groove_gotStats.bind(this)), 5000);
    }

    Groove.prototype = Object.create(WildEmitter.prototype, {
        constructor: {value: Groove}
    });

    /*
     * Connects to a buoy server and instantiates this.buoy
     */
    Groove.prototype.connectToBuoy = function(url) {
        this.buoy = new Buoy(url);

        // Setup buoy events
        this.buoy.on("welcome", this.onBuoyWelcome.bind(this));
        this.buoy.on("chat", this.onBuoyChat.bind(this));
        this.buoy.on("peerJoined", this.onBuoyPeerJoined.bind(this));
        this.buoy.on("peerLeft", this.onBuoyPeerLeft.bind(this));
        this.buoy.on("roomData", this.onBuoyRoomData.bind(this));
        this.buoy.on("recvMessage", this.onBuoyRecvMessage.bind(this));
        this.buoy.on("newDJ", this.onBuoyNewDJ.bind(this));
        this.buoy.on("removeDJ", this.onBuoyRemoveDJ.bind(this));
        this.buoy.on("setActiveDJ", this.onBuoySetActiveDJ.bind(this));
        this.buoy.on("setActiveTrack", this.onBuoySetActiveTrack.bind(this));
        this.buoy.on("setName", this.onBuoySetName.bind(this));
        this.buoy.on("setGravatar", this.onBuoySetGravatar.bind(this));
        this.buoy.on("setVote", this.onBuoySetVote.bind(this));
    }

    Groove.prototype.onBuoyWelcome = function(data) {
        console.log("Assigned PID: "+ data.id);
        this.me.id = data.id;
    }

    Groove.prototype.onBuoyChat = function(data) {
        this.emit('chat', {
            text: String(data.msg),
            from: this.users[data.from]
        });
    }

    Groove.prototype.onBuoyRoomData = function(data) {
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
            console.log("Found user", user.name, user.id);
        }

        this.users[this.me.id] = this.me;

        for (i = 0; i < data.djs.length; i++) {
            var dj = this.users[data.djs[i]];
            if (!dj) {
                console.error("Unknown DJ", data.djs[i]);
                continue;
            }
            dj.dj = true;
            this.djs.push(dj);
        }

        this.activeTrack = data.activeTrack;
        this.activeDJ = this.djs[data.activeDJ];
        if (this.activeDJ) {
            // prepare to receive track stream
            this.activeDJ.preparePeerConnection();
        }
        this.emit("djs", this.djs.slice());
        this.emit("activeDJ");
        this.emit("activeTrack");
    };

    Groove.prototype.onBuoyRecvMessage = function(data) {
        var user = this.users[data.from];
        if (!user) {
            console.error("Received message from unknown user " + user.id);
        }
        user.handleMessage(data.msg);
    };

    Groove.prototype.onBuoyPeerLeft = function(data) {
        this.emit("peerDisconnected", this.users[data.id]);
        console.log("User "+ this.users[data.id].name +" disconnected");

        delete this.users[data.id];
    }

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

        this.emit("activeDJ");
    };

    Groove.prototype.onBuoySetActiveTrack = function(data) {
        this.activeTrack = data.track;
        this.emit("activeTrack");
        // the active DJ will now stream the track to us
        // (unless we are the active DJ)

        for(var id in this.users) {
            var user = this.users[id];
            user.vote = 0;
            this.emit("setVote", user);
        }
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
        }
    }

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
        console.log('becoming active');
        var track = this.playlists[this.activePlaylist][0];
        this.me.activeTrack = track;

        if (!track) {
            this.quitDJing();
        }

        this.buoy.send('setActiveTrack', {
            track: exportTrack(track)
        });

        // play our active track, and send it to peers.

        var peers = this.getPeers();
        
        // start playing track locally
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
        this.buoy.send('skip', {});
        this.cleanupDJing();
    }

    // remove peer connection and stream to user
    function Groove_removePeerStream(user) {
        user.removeStream(this.stream);
    }

    // clean up after no longer the active DJ
    Groove.prototype.cleanupDJing = function() {
        this.activeDJ = null;
        this.activeTrack = null;
        this.emit('activeDJ');
        this.emit('activeTrack');
        this.emit('activeTrackURL');
        if (this.stream) {
            this.getPeers().forEach(Groove_removePeerStream.bind(this));
        }
        if (this.mediaSource) {
            this.mediaSource.disconnect();
            this.mediaSource.stop(0);
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
            duration: null // don't know this yet
        };

        console.log('track', track, tags);
        var playlist = this.playlists[this.activePlaylist];
        playlist.push(track);

        track.playlistPosition = playlist.indexOf(track);

        if (playlist.length == 1) {
            this.me.activeTrack = track;
        }

        if(this.persist) {
            this.db.storeTrack(track);
        }

        this.emit('queueUpdate');
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

            this.getPersistTracks();
        } else {
            this.db.clearDb();
        }

        this.persist = val;
    }

    Groove.prototype._persistTracksCb = function(tracks) {
        tracks = tracks.sort(function(a, b) {
            if(a.playlistPosition > b.playlistPosition)
                return 1;
            else 
                return -1;
        });

        this.playlists[this.activePlaylist] = tracks;
        this.me.activeTrack = this.playlists[this.activePlaylist][0];

        groove.emit("playlistUpdated", this.activePlaylist);
    }

    Groove.prototype.getPersistTracks = function() {
        this.db.getTracks(this._persistTracksCb.bind(this));
    }

    Groove.prototype.savePlaylist = function(name) {
        if(!this.persist) return;

        var self = this;
        this.playlists[name].forEach(function(track) {
            self.db.storeTrack(track);
        });
    }

    Groove.prototype.deleteTrack = function(playlistName, track) {
        var playlist = this.playlists[playlistName];
        var i = playlist.indexOf(track);

        if(i == -1) return;
        playlist.splice(i, 1);

        if(this.persist) this.db.deleteTrack(track);
    }

    Groove.prototype.vote = function(direction) {
        this.me.setVote(direction);
        this.emit("setVote", this.me);

        this.buoy.send("setVote", {
            vote: this.me.vote
        });
    };

    // set volume of local (DJ's) stream
    Groove.prototype.setVolume = function(volume) {
        this.gainNode.gain.value = volume;
    };

    // play my track locally, as the active DJ
    Groove.prototype._playMyTrack = function() {
        var track = this.me.activeTrack;
        var reader = new FileReader();
        reader.readAsArrayBuffer(track.file);
        reader.onload = function(e) {
            this.audioContext.decodeAudioData(e.target.result,
                Groove_gotAudioData.bind(this));
        }.bind(this);
    };

    // local audio track finished playing
    function Groove_onPlaybackEnded() {
        // yield to the next DJ
        this.buoy.send('skip', {});

        // Swap out songs
        var playlist = this.playlists[this.activePlaylist];
        if(playlist.length == 1) return;
        
        var tmp = playlist.shift();
        playlist.push(tmp);
        this.emit("playlistUpdated", this.activePlaylist);
    }

    // handle audio data decoded from file.
    // should be called by active DJ beginning to play track
    function Groove_gotAudioData(buffer) {
        if (this.me != this.activeDJ) return;

        // thanks to:
        // http://servicelab.org/2013/07/24/streaming-audio-between-browsers-with-webrtc-and-webaudio/

        // create an audio source and connect it to the file buffer
        this.mediaSource = this.audioContext.createBufferSource();
        this.mediaSource.buffer = buffer;
        this.mediaSource.start(0);

        // handle end of playback
        this.mediaSource.onended = Groove_onPlaybackEnded.bind(this);

        // connect the audio stream to the audio hardware
        this.mediaSource.connect(this.gainNode);

        // create a destination for the remote browser
        var remote = this.audioContext.createMediaStreamDestination();

        // connect the remote destination to the source
        this.mediaSource.connect(remote);

        // send stream to peers
        this.stream = remote.stream;
        this.streamToPeers();
    }

    Groove.prototype.streamToPeer = function(user) {
        user.preparePeerConnection();
        // add the stream to the peer connection
        user.addStream(this.stream);
        // connect
        user.offerConnection();
    };

    Groove.prototype.streamToPeers = function() {
        if (!this.stream) {
            console.error("No stream to send");
            return;
        }
        this.getPeers().forEach(this.streamToPeer.bind(this));
    };

    // our track was able to be loaded by the player.
    Groove.prototype.canPlayTrack = function(duration) {
        if (this.me != this.activeDJ) {
            return;
        }
        this.activeTrack.duration = duration;
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
                (stat.packetsLost + stat.packetsReceived)

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
        // make the object url for the track stream
        this.activeTrack.url = createObjectUrl(stream);
        this.emit('activeTrackURL');
    };

    window.Groove = Groove;
})();
