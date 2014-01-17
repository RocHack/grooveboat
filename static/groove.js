(function () {
    var isChrome = 'WebKitPoint' in window;

    // TODO: put this in a Track class
    function exportTrack(t) {
        return {
            title: t.title,
            artist: t.artist,
            album: t.album,
            currentTime: t.currentTime,
            duration: t.duration
        };
    }

    function Groove() {
        var self = this;
        WildEmitter.call(this);

        var users = this.users = {};
        var djs = this.djs = [];
        this.activeDJ = null;

        var me = this.me = new User(this);
        me.isLocal = true;

        this.playlists = {default: []};
        this.activePlaylist = 'default';
        this.activeTrack = null;

        this.webrtc = new WebRTC({
            url: '//celehner.com',
            resource: 'signalmaster/socket.io',
            video: false,
            audio: false,
            data: true,
            autoRequestMedia: false,
            peerConnectionConfig: {
                iceServers: [{
                    "url": isChrome ?
                        "stun:stun.l.google.com:19302" : "stun:124.124.124.2"
                }, {
                    url: "turn:grooveboat@celehner.com",
                    credential: "signalmaster"
                }]
            }
        });

        /*
         * WebRTC events
         */
        this.webrtc.on('readyToCall', function () {
            self.emit('ready');
        });

        this.webrtc.on('userid', function (id) {
            me.id = id;
        });

        this.webrtc.on('dataOpen', function (event, conversation) {
            var channel = conversation.channel,
                userId = conversation.id,
                user = users[userId] = new User(self, userId);
            self._welcomeUser(user);
        });

        this.webrtc.on('dataClose', function (event, conversation) {
            var channel = conversation.channel,
                userId = conversation.id,
                user = users[userId];
            if (!user) {
                return;
            }
            self.emit('peerDisconnected', user);
            if (user.dj) {
                self._acceptQuitDJ(user);
            }
            delete users[userId];
        });

        this.webrtc.on('dataError', function (event, conversation) {
            var channel = conversation.channel,
                userId = conversation.id,
                user = users[userId];
            console.error('data error', channel, userId);
            self.emit('peerError', user);
        });

        this.webrtc.on('dataMessage', this._onMessage.bind(this));
        
        /*
         * User events
         */
        this.me.on("name", function() {
            // TODO: Send a message to the buoy
        });

        // keep track of the seek time of the active track
        setInterval(this.clock.bind(this), 1000);
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
    }

    Groove.prototype.joinRoom = function(roomName) {
        this.roomName = roomName;
        this.buoy.send("joinRoom", { name: roomName });
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
        this.webrtc.leaveRoom();
        this.roomName = null;
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

    Groove.prototype.sendChat = function(text) {
        this.webrtc.send({
            type: 'chat',
            text: String(text)
        });
    };

    Groove.prototype.sendGravatar = function() {
        this.webrtc.send({
            type: 'gravatar',
            gravatar: this.me.gravatar
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
        var after = this.djs[this.djs.length-1];
        this.webrtc.send({
            type: 'nominateDJ',
            after: after && after.id
        });
        setTimeout(function() {
            this._acceptDJ(this.me, after);
            if (!after) {
                this.becomeActiveDJ();
            }
        }.bind(this), 10);
    };

    Groove.prototype._acceptDJ = function(dj, prevDJ) {
        if (dj == prevDJ) prevDJ = null;
        var djs = this.djs,
            djIndex = djs.indexOf(dj),
            prevDJIndex = prevDJ ? djs.indexOf(prevDJ) : -1;
        console.log('accept dj', dj && dj.name, prevDJ && prevDJ.name, djs);
        if (djIndex != -1) {
            // dj is already in djs list
            if (djs[prevDJIndex + 1] == dj) {
                // already in position
                return;
            }
            // remove from old position
            djs.splice(djIndex, 1);
            prevDJIndex = prevDJ ? djs.indexOf(prevDJ) : -1;
        }

        if (prevDJIndex == -1) {
            djs.push(dj);
        } else {
            djs.splice(prevDJIndex + 1, 0, dj);
        }

        dj.dj = true;
        this.emit('djs', this.djs.slice());
    };

    Groove.prototype.quitDJing = function() {
        if (!this.me.dj) {
            return;
        }
        this.webrtc.send({
            type: 'quitDJing'
        });
        setTimeout(this._acceptQuitDJ.bind(this, this.me), 10);
    };

    Groove.prototype._acceptQuitDJ = function(user) {
        user.dj = false;
        var i = this.djs.indexOf(user);
        user._cleanupChunks();
        if (i != -1) {
            this.djs.splice(i, 1);
        }
        if (this.activeDJ == user) {
            this.activeDJ = null;
            this.activeTrack = null;
            this.emit('activeDJ');
            this.emit('activeTrack');
            this.emit('activeTrackURL');
            // todo: allow next dj to take place
        }
        this.emit('djs', this.djs.slice());
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

        console.log('got start time', track.currentTime);
        track.startDate = new Date;
        track.startDate.setSeconds(track.startDate.getSeconds() - track.currentTime|0);

        this.emit('activeDJ');
        this.emit('activeTrack');
        if (user != this.me) {
            user.requestFile('current');
        }
    };

    // increment the current track time once a second
    Groove.prototype.clock = function() {
        var track = this.activeTrack;
        if (!track) {
            return;
        }
        track.currentTime = (new Date - track.startDate)/1000;

        // if we are the upcoming DJ, start DJing after the current song ends
        var trackEnded = track.duration && track.currentTime > track.duration - 1;
        if (trackEnded) {
            if (this.isUpcomingDJ(this.me) ) {
                this.becomeActiveDJ();
            }
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
            ID3v2.parseFile(file,
                grooveFileParsed.bind(this, file, next));
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

    Groove.prototype.becomeActiveDJ = function() {
        console.log('becoming active');
        this.activeDJ = this.me;
        var track = this.me.activeTrack;

        track.currentTime = 0;
        track.startDate = new Date
        this.webrtc.send({
            type: 'activeTrack',
            track: exportTrack(track)
        });
        setTimeout(function() {
            this._acceptActiveTrack(track, this.me);
            this._startPlaying();
        }.bind(this), 10);
    };

    // play our active track, and send it to peers.
    Groove.prototype._startPlaying = function() {
        // prepare track if needed
        if (!this.localTrackLoaded) {
            this.prepareNextTrack(this._startPlaying);
            return;
        }

        // send our active track to peers who we haven't sent it to yet
        this.streamToPeers(this.me.activeTrack, this.getPeers());
        // play track locally
        this._playMyTrack();
    };

    // play my track locally, as the active DJ
    Groove.prototype._playMyTrack = function() {
        var track = this.me.activeTrack;
        var file = track.file;

        // make the object url for the track file
        var URL = window.URL || window.webkitURL;
        track.url =
            window.createObjectURL ? window.createObjectURL(file) :
            window.createBlobURL ? window.createBlobURL(file) :
            URL && URL.createObjectURL ? URL.createObjectURL(file) : null;
        if (!track.url) {
            throw new Error('Unable to make object URL for track file', file);
        }

        this.emit('activeTrackURL');

        // start preloading next track
        //this.requestNextTrack();
    };

    // request a track file from the upcoming DJ, for preloading
    Groove.prototype.requestNextTrack = function() {
        var dj = this.getUpcomingDJ();
        if (dj) {
            dj.requestFile('upcoming');
        } else {
            console.log('No upcoming DJs');
        }
    };

    // our track was able to be loaded by the player.
    Groove.prototype.canPlayTrack = function(duration) {
        if (this.me != this.activeDJ) {
            return;
        }
        this.activeTrack.duration = duration;
        // tell peers about the track duration if this is our track
        var event = {
            type: 'trackDuration',
            duration: duration
        };
        this.getPeers().forEach(function(peer) {
            peer.send(event);
        });
    };

    // load and chunk our next active track, to prepare it for streaming
    Groove.prototype.prepareNextTrack = function(cb) {
        var track = this.me.activeTrack;
        if (this.localTrackLoaded == track) {
            cb.call(this);
            return;
        } else if (this.localTrackLoading) {
            this.on('localTrackLoaded', cb.bind(this));
            return;
        }
        this.localTrackLoading = true;

        var reader = new FileReader();
        reader.readAsDataURL(track.file);
        reader.onload = function() {
            var dataURL = reader.result;
            // split into chunks
            var chunkSize = 900;
            var numChunks = Math.ceil(dataURL.length / chunkSize);
            var chunks = track.chunks = new Array(numChunks+1);
            chunks[0] = {
                type: 'chunkStart',
                i: 0,
                name: track.file.name,
                numChunks: numChunks
            };

            for (var i = 0; i < numChunks; i++) {
                if (i % 100 == 0) {
                    var percent = Math.ceil(100 * i/numChunks);
                    console.log('loading chunk', i, '(' + percent + '%)');
                }
                var dataURLChunk = (i == numChunks-1) ?
                    dataURL.substr(i * chunkSize) :
                    dataURL.substr(i * chunkSize, chunkSize);
                chunks[i+1] = {
                    i: i + 1,
                    type: 'chunk',
                    data: dataURLChunk
                };
            }
            this.localTrackLoaded = track;
            this.localTrackLoading = false;
            this.emit('localTrackLoaded');
            cb.call(this);
        }.bind(this);
    };

    Groove.prototype.streamToPeers = function(track, peers, start) {
        var chunks = track.chunks,
            numChunks = chunks && chunks.length;
        if (!numChunks) {
            console.error('No active track chunks to stream.');
            return;
        }
        if (track != this.me.activeTrack) {
            console.error('Preloading tracks is unsupported');
        }

        // only send to peers we haven't already sent the track
        peers = peers.filter(function(peer) {
            return peer.sendingTrack != track;
        });
        if (!peers.length) return;

        peers.forEach(function(peer) {
            peer.sendingTrack = track;
        });

        // send data
        var names = peers.map(function(peer) { return peer.id; }).join(', ');
        console.log('streaming to', names);
        this._streamToPeers(peers, chunks, start | 0); 
    };

    Groove.prototype._sendTrack = function(user, track_type) {
        var track = this.activePlaylist[0];
        if(track_type == "current") {
            track = groove.activeTrack;
        } else {
            console.error("Only streaming the current track is supported.");
            return;
        }
        this.streamToPeers(track, [user]);
    };

    Groove.prototype._sendTrackChunk = function(user, track_type) {
        var track = this.activePlaylist[0];
        if(track_type == "current") {
            track = groove.activeTrack;
        }

        user.send({
            type: "receiveChunk",
            chunk: track.chunks[i]
        });
    };

    Groove.prototype._streamToPeers = function(peers, chunks, start) {
        var me = this.me,
            users = this.users;

        // weed out inactive peers
        peers = peers.filter(function(peer) {
            return peer != me && peer.id in users;
        });
        if (!peers.length) return;

        // if we quit DJing, stop streaming to peers
        if (!me.dj) {
            peers.forEach(function(peer) {
                peer.sendingTrack = null;
            });
            return;
        }

        var numChunks = chunks.length;
        var end = Math.min(start + 200, numChunks);
        for (var i = start; i < end; i++) {
            var msg = chunks[i];
            if (i % 100 == 0) {
                var percent = (i/numChunks * 100).toFixed(1);
                console.log('sending chunks', i, '(' + percent + '%)');
            }
            for (var j = 0; j < peers.length; j++) {
                peers[j].send(msg);
            }
        }

        // send the rest
        if (i < chunks.length) {
            var next = this._streamToPeers.bind(this, peers, chunks, i);
            setTimeout(next, 50);

        } else if (i >= numChunks) {
            // done
            peers.forEach(function(peer) {
                peer.sendingTrack = null;
            });
        }
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

    window.Groove = Groove;
})();
