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
            myActiveTrack: amDJ ? this.activeTrack : null
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
        if (!after) {
            this.becomeActiveDJ();
        }
        setTimeout(this._acceptDJ.bind(this, this.me, after), 10);
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

        case 'chunk':
            this._gotChunk(event.data, user);
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
        readFile(track.file, function(buf) {
            this.activeTrackArrayBuffer = buf;
            // split into chunks
            var chunkSize = 640;
            var numChunks = Math.ceil(buf.byteLength/chunkSize);
            var chunks = this.activeTrackChunks = new Array(numChunks);
            for (var i = 0; i < numChunks; i++) {
                if (i % 100 == 0) {
                    console.log('loading chunk', i, '(' + (i/numChunks) + ')');
                }
                var chunkBuf = (i == numChunks-1) ?
                    new Uint8Array(buf, i * chunkSize):
                    new Uint8Array(buf, i * chunkSize, chunkSize);
                chunks[i] = {
                    type: 'chunk',
                    data: StringView.bytesToBase64(chunkBuf)
                };
            }
            this.streamToPeers(this.getPeers());
        }.bind(this));
    };

    function readFile(file, cb) {
        var reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = function() {
            console.log('onload');
            cb(reader.result);
        };
    }

    Groove.prototype.streamToPeers = function(peers, start) {
        var chunks = this.activeTrackChunks;
        if (!chunks || !chunks.length) {
            console.error('No active track chunks to stream.');
            return;
        }

        // weed out inactive peers
        var users = this.users,
            me = this.me;
        peers = peers.filter(function(peer) {
            return peer != me &&
                peer.id in users;
        });
        if (!peers.length) {
            return;
        }

        // send data
        var names = peers.map(function(peer) { return peer.id; }).join(', ');
        console.log('streaming to', names);
        start |= 0;
        var end = Math.min(start + 200, chunks.length);
        for (var i = start; i < end; i++) {
            var msg = chunks[i];
            if (i % 100 == 0) {
                var percent = (i/chunks.length * 100).toFixed(1);
                console.log('sending chunks', i, '(' + percent + '%)');
            }
            for (var j = 0; j < peers.length; j++) {
                peers[j].send(msg);
            }
        }

        // send the rest
        if (i < chunks.length) {
            setTimeout(this.streamToPeers.bind(this, peers, i), 50);
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

    Groove.prototype._gotChunk = function(data, user) {
        if (Math.random() < 0.05) {
            console.log('got chunk of length', data.length, 'from', user.name);
        }
        if (!user.dj) {
            console.error('got chunk from non-dj');
            return;
        }
        return;
        var chunkBuf = StringView.base64ToBytes(data);
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

    // set default icon URL
    User.prototype.updateIconURL();

    window.User = User;
    window.Groove = Groove;
})();
