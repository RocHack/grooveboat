(function () {
    // TODO: put this in a Track class
    function exportTrack(t) {
        return {
            title: t.title,
            artist: t.artist,
            album: t.album,
            duration: t.duration
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
    };

    Groove.prototype.onBuoySetGravatar = function(data) {
        var user = this.users[data.peer];
        if(!user) return;
        user.setGravatar(data.gravatar);
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

    Groove.prototype._welcomeUser = function(user) {
        var amDJ = this.me == this.activeDJ;
        this.webrtc.send({
            type: 'welcome',
            name: this.me.name,
            gravatar: this.me.gravatar,
            vote: this.me.vote,
            djs: this.djs.filter(Boolean)
                .map(function(user) { return user.id; }),
            active: this.activeDJ ? this.djs.indexOf(this.activeDJ) : -1,
            myActiveTrack: amDJ ? exportTrack(this.activeTrack) : null
        }, user.id);
        this.emit('peerConnected', user);
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
        var track = this.me.activeTrack;
        this.buoy.send('setActiveTrack', {
            track: exportTrack(track)
        });

        // play our active track, and send it to peers.

        var peers = this.getPeers();
        if (!peers.length) {
            // empty room :(
            return;
        }

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

    // remove peer connection and stream to user
    function Groove_removePeerStream(user) {
        //user.pc.removeStream(this.stream);
    }

    // clean up after no longer the active DJ
    Groove.prototype.cleanupDJing = function() {
        this.activeDJ = null;
        this.activeTrack = null;
        this.emit('activeDJ');
        this.emit('activeTrack');
        this.emit('activeTrackURL');
        this.getPeers().forEach(Groove_removePeerStream.bind(this));
        if (this.mediaSource) this.mediaSource.stop(0);
    };

    Groove.prototype._negotiateDJs = function(djs, sender, activeDJ) {
        djs = djs.filter(Boolean);
        if (!djs.length) return;
        // todo: reconcile with other data known about DJs
        this.djs.forEach(function(user) {
            user.dj = false;
        });
        this.djs = djs;
        djs.forEach(function(user) {
            user.dj = true;
        });
        this.emit('djs', this.djs.slice());
        var activeTrack = activeDJ.activeTrack;
        if (activeTrack) {
            this._acceptActiveTrack(activeTrack, activeDJ);
        }
        console.log('got dj list', djs, 'from', sender.name);
    };

    // get the next DJ to play
    Groove.prototype.getUpcomingDJ = function() {
        var activeDJI = this.djs.indexOf(this.activeDJ);
        var nextDJ;
        if (activeDJI != -1) {
            var nextDJI = (activeDJI+1) % this.djs.length;
            nextDJ = this.djs[nextDJI];
        }
        console.log('active DJ', activeDJI, 'next dj', nextDJ);
    };

    // is it a DJ's valid turn to start playing
    Groove.prototype.isUpcomingDJ = function(user) {
        //console.log('activeDJI', activeDJI, 'nextDJI', nextDJI);
        var upcomingDJ = this.getUpcomingDJ();
        return !upcomingDJ || upcomingDJ == user;
    };

    // process a user claiming the active DJ spot
    Groove.prototype._negotiateActiveTrack = function(track, user) {
        // remember the track they are sending, in case they become dj
        user.activeTrack = track;
        if (this.isUpcomingDJ(user)) {
            this._acceptActiveTrack(track, user);
        } else {
            console.error('User is not an up dj');
        }
    };

    // update the active track and DJ
    Groove.prototype._acceptActiveTrack = function(track, user) {
        console.log('accept active dj');
        this.activeTrack = track;
        this.activeDJ = user;

        this.emit('activeDJ');
        this.emit('activeTrack');
        if (user != this.me) {
            user.requestFile('current');
        }
    };

    Groove.prototype._onMessage = function(event, conversation) {
        //console.log('event', typeof event, event.length, event.type);
        var channel = conversation.channel,
            userId = conversation.id,
            users = this.users,
            user = users[userId];
        switch (event.type) {
        case 'welcome':
            user.setGravatar(event.gravatar);
            user.setName(event.name);
            user.setVote(event.vote);
            if (event.myActiveTrack) {
                user.activeTrack = event.myActiveTrack;
            }
            // receive dj listing from peers already in the room
            if (event.djs && !conversation.initiator) {
                var djs = event.djs.map(function(id) {
                    return users[id];
                });
                var activeDJ = users[event.djs[event.active]];
                this._negotiateDJs(djs, user, activeDJ);
            }
            break;

        case 'name':
            user.setName(event.name);
            break;

        case 'gravatar':
            user.setGravatar(event.gravatar);
            break;

        case 'chat':
            this.emit('chat', {
                text: String(event.text),
                from: user
            });
            break;

        case 'track':
            this.emit('track', {
                track: event.track,
                user: user
            });
            break;

        case 'nominateDJ':
            var dj = event.user ? this.users[event.user] : user;
            var prevDJ = event.after && this.users[event.after];
            this._acceptDJ(dj, prevDJ);
            break;

        case 'quitDJing':
            this._acceptQuitDJ(user);
            break;

        case 'vote':
            user.setVote(event.direction);
            break;

        case 'activeTrack':
            this._negotiateActiveTrack(event.track, user);
            break;

        case 'trackDuration':
            user._gotTrackDuration(event.duration);
            break;

        case 'chunkStart':
            user._gotChunkStart(event);
            break;

        case 'chunk':
            user._gotChunk(event);
            break;
            
        case 'requestTrack':
            this._sendTrack(user, event.track);
            break;

        case 'requestTrackChunk':
            this._sendTrackChunk(user, event.i);
            break;
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
            file: file,
            title: tags.Title || 'Untitled',
            artist: tags.Artist || 'Unknown',
            album: tags.Album || 'Unknown',
            duration: null // don't know this yet
        };
        console.log('track', track, tags);
        var playlist = this.playlists[this.activePlaylist];
        playlist.push(track);
        if (playlist.length == 1) {
            this.me.activeTrack = track;
        }
        this.emit('queueUpdate');
        next();
    }

    function grooveProcessFile(files, i) {
        if (i > files.length) return;

        var next = grooveProcessFile.bind(this, files, i+1);
        var file = files[i];

        if (file && file.type.indexOf('audio/') == 0) {
            parseAudioMetadata(file, grooveFileParsed.bind(this, file, next));
        } else {
            next();
        }
    }

    Groove.prototype.addFilesToQueue = function(files) {
        grooveProcessFile.call(this, files, 0);
    };

    Groove.prototype.vote = function(direction) {
        this.me.setVote(direction);
        this.webrtc.send({
            type: 'vote',
            direction: direction
        });
    };

    // play my track locally, as the active DJ
    Groove.prototype._playMyTrack = function() {
        var track = this.me.activeTrack;
        var reader = new FileReader();
        this.audioContext = new AudioContext();
        reader.readAsArrayBuffer(track.file);
        reader.onload = function(e) {
            this.audioContext.decodeAudioData(e.target.result,
                Groove_gotAudioData.bind(this));
        }.bind(this);
    };

    // handle audio data decoded from file.
    // should be called by active DJ beginning to play track
    function Groove_gotAudioData(buffer) {
        // thanks to:
        // http://servicelab.org/2013/07/24/streaming-audio-between-browsers-with-webrtc-and-webaudio/

        // create an audio source and connect it to the file buffer
        this.mediaSource = this.audioContext.createBufferSource();
        this.mediaSource.buffer = buffer;
        this.mediaSource.start(0);

        // connect the audio stream to the audio hardware
        this.mediaSource.connect(this.audioContext.destination);

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

    // got a stream through WebRTC from the active DJ
    Groove.prototype.gotRemoteStream = function(stream) {
        // make the object url for the track stream
        this.activeTrack.url = createObjectUrl(stream);
        this.emit('activeTrackURL');
    };

    window.Groove = Groove;
})();
