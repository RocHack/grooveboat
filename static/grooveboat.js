(function () {
    var isChrome = 'WebKitPoint' in window;

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

    }

    Groove.prototype = Object.create(WildEmitter.prototype, {
        constructor: {value: Groove}
    });

    Groove.prototype.joinRoom = function(roomName) {
        this.roomName = roomName;
        this.webrtc.joinRoom(roomName);
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
            myActiveTrack: amDJ ? this.exportActiveTrack() : null
        }, user.id);
        this.emit('peerConnected', user);
        if (amDJ) {
            this.streamToPeers([user]);
        }
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
        this._acceptActiveTrack(activeDJ.activeTrack, activeDJ);
        console.log('got dj list', djs, 'from', sender.name);
    };

    // is it a DJ's valid turn to start playing
    Groove.prototype.isDJUp = function(user) {
        // for now, allow any dj to play whenever they want
        return (this.djs.indexOf(user) != -1);
    };

    Groove.prototype._negotiateActiveTrack = function(track, user) {
        // remember the track they are sending, in case they become dj
        user.activeTrack = track;
        if (this.isDJUp(user)) {
            this._acceptActiveTrack(track, user);
        }
    };

    Groove.prototype._acceptActiveTrack = function(track, user) {
        this.activeTrack = track;
        this.activeDJ = user;
        this.emit('activeDJ');
        this.emit('activeTrack');
    };

    Groove.prototype.exportActiveTrack = function() {
        var t = this.activeTrack;
        return {
            title: t.title,
            artist: t.artist,
            album: t.album
        };
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

        case 'chunkStart':
            user._gotChunkStart(event);
            break;

        case 'chunk':
            user._gotChunk(event);
            break;
        }
    };

    function grooveFileParsed(file, next, tags) {
        var track = {
            file: file,
            title: tags.Title || 'Untitled',
            artist: tags.Artist || 'Unknown',
            album: tags.Album || 'Unknown'
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
        this.me.vote = direction;
        this.webrtc.send({
            type: 'vote',
            direction: direction
        });
    };

    Groove.prototype.becomeActiveDJ = function() {
        console.log('becoming active');
        this.activeDJ = this.me;
        var track = this.me.activeTrack;
        this.webrtc.send({
            type: 'activeTrack',
            track: track
        });
        setTimeout(this._acceptActiveTrack.bind(this, track, this.me), 10);

        // send our active track to peers who we haven't sent it to yet
        if (this.localTrackLoaded) {
            this.streamToPeers(this.getPeers());
        } else {
            this.prepareNextTrack(function() {
                this.streamToPeers(this.getPeers());
            });
        }
    };

    // load and chunk our next active track, to prepare it for streaming
    Groove.prototype.prepareNextTrack = function(cb) {
        var track = this.me.activeTrack;
        if (this.localTrackLoaded == track) {
            cb.call(this);
            return;
        } else {
            this.on('localTrackLoaded', cb.bind(this));
        }

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
            this.emit('localTrackLoaded');
        }.bind(this);
    };

    Groove.prototype.streamToPeers = function(peers, start) {
        var track = this.me.activeTrack,
            chunks = track.chunks,
            numChunks = chunks && chunks.length;
        if (!numChunks) {
            console.error('No active track chunks to stream.');
            return;
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
    function User(groove, id) {
        WildEmitter.call(this);
        this.groove = groove;
        this.id = id;
    }

    User.maxNameLength = 32;

    User.prototype = Object.create(WildEmitter.prototype, {
        constructor: {value: User}
    });

    User.prototype.local = false;
    User.prototype.name = 'Guest';
    User.prototype.vote = 0;
    User.prototype.iconURL = 0;

    User.prototype.setName = function(name) {
        if (!name || !name.trim()) {
            delete this.name;
        } else if (name.length > User.maxNameLength) {
            this.name = name.substr(0, User.maxNameLength);
        } else {
            this.name = name;
        }
        this.updateIconURL();
        this.emit('name');
    };

    User.prototype.setVote = function(direction) {
        this.vote = direction < 0 ? -1 : direction > 0 ? 1 : 0;
        this.emit('vote');
    };

    User.prototype.setGravatar = function(gravatar) {
        this.gravatar = gravatar;
        this.updateIconURL();
        this.emit('gravatar', gravatar);
    };

    User.prototype.updateIconURL = function() {
        var id = this.gravatar || this.name || "";
        if (this.gravatarId == id) return;
        this.gravatarId = id;
        this.iconURL = "//www.gravatar.com/avatar/"+ md5(id) +"?s=80&d=monsterid";
    };

    User.prototype.send = function(msg) {
        this.groove.webrtc.send(msg, this.id);
    };

    User.prototype._gotChunkStart = function(event) {
        this.incomingFilename = event.name;
        this.numChunks = event.numChunks | 0;
        this.incomingChunks = new Array(this.numChunks);
    };

    User.prototype._gotChunk = function(event) {
        if (Math.random() < 0.05) {
            console.log('got chunk', event.i, 'out of', this.numChunks);
        }
        if (!this.dj) {
            console.error('got chunk from non-dj');
            return;
        }

        this.incomingChunks[event.i] = event.data;

        // Handles final chunk
        if (event.i >= this.numChunks) {
            var name = this.incomingFilename;
            // TODO: Scan for missing chunks
            this._gotDataURL(this.incomingChunks.join(''), name);
        }
    };

    User.prototype._cleanupChunks = function() {
        this.incomingChunks = null;
        this.incomingFilename = null;
        this.numChunks = null;
    };

    User.prototype._gotDataURL = function(dataURL, filename) {
        console.log('got data url of length', dataURL.length,
            'from', this.name);
        if (this == this.groove.activeDJ) {
            this.groove.activeTrack.url = dataURL;
            this.groove.emit('activeTrackURL');
            console.log('activeTrackURL');
        } else {
            this.upcomingTrackURL = dataURL;
        }
        this._cleanupChunks();
    };


    // set default icon URL
    User.prototype.updateIconURL();

    window.User = User;
    window.Groove = Groove;
})();
