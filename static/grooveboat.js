/*global WebRTC: false, WildEmitter: false, md5: false, ID3v2: false,
  Reliable: false */

(function () {
    var isChrome = 'WebKitPoint' in window;

    // TODO: make a Track class, and put this there
    function exportTrack(t) {
        return {
            title: t.title,
            artist: t.artist,
            album: t.album
        };
    };

    function Groove() {
        var self = this;
        WildEmitter.call(this);

        var users = this.users = {};
        this.djs = [];
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
            var userId = conversation.id,
                user = users[userId] = new User(self, userId, conversation);
            self._welcomeUser(user);
        });

        this.webrtc.on('dataClose', function (event, conversation) {
            var userId = conversation.id,
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

    // send a message to every peer in the room
    Groove.prototype.broadcast = function(msg) {
        // TODO: pack the message once instead of letting Reliable do it
        // for very peer the data is sent to
        for (var id in this.users) {
            var peer = this.users[id];
            if (peer && peer != this.me) {
                peer.send(msg);
            }
        }
    };

    Groove.prototype._welcomeUser = function(user) {
        var amDJ = this.me == this.activeDJ;
        user.send({
            type: 'welcome',
            name: this.me.name,
            gravatar: this.me.gravatar,
            vote: this.me.vote,
            djs: this.djs.filter(Boolean)
                .map(function(user) { return user.id; }),
            active: this.activeDJ ? this.djs.indexOf(this.activeDJ) : -1,
            myActiveTrack: amDJ ? exportTrack(this.activeTrack) : null
        });
        this.emit('peerConnected', user);
        if (amDJ) {
            this.streamToPeers([user]);
        }
    };

    Groove.prototype.sendChat = function(text) {
        this.broadcast({
            type: 'chat',
            text: String(text)
        });
    };

    Groove.prototype.sendGravatar = function() {
        this.broadcast({
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
        this.broadcast({
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
        this.broadcast({
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

    Groove.prototype.gotChat = function(user, text) {
        this.emit('chat', {
            text: text,
            from: user
        });
    };

    Groove.prototype.gotTrack = function(user, track) {
        this.emit('track', {
            track: track,
            user: user
        });
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
            ID3v2.parseFile(file, grooveFileParsed.bind(this, file, next));
        } else {
            next();
        }
    }

    Groove.prototype.addFilesToQueue = function(files) {
        grooveProcessFile.call(this, files, 0);
    };

    Groove.prototype.vote = function(direction) {
        this.me.vote = direction;
        this.broadcast({
            type: 'vote',
            direction: direction
        });
    };

    Groove.prototype.becomeActiveDJ = function() {
        console.log('becoming active');
        this.activeDJ = this.me;
        var track = this.me.activeTrack;
        this.broadcast({
            type: 'activeTrack',
            track: exportTrack(track)
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
        } else if (!this.localTrackLoading) {
            this.localTrackLoading = true;
        } else {
            this.on('localTrackLoaded', cb.bind(this));
            return;
        }

        var reader = new FileReader();
        reader.readAsArrayBuffer(track.file);
        reader.onload = function() {
            var buf = reader.result;
            this.trackData = buf;
            this.localTrackLoaded = track;
            this.localTrackLoading = false;
            this.emit('localTrackLoaded');
        }.bind(this);
    };

    Groove.prototype.streamToPeers = function(peers) {
        var track = this.me.activeTrack,
            me = this.me,
            users = this.users;

        if (!this.trackData) {
            console.error('No active track chunks to stream.');
            return;
        }

        // filter out inactive peers, peers we already sent the track to,
        // and ourself
        peers = peers.filter(function(peer) {
            return peer.sendingTrack != track &&
                peer != me &&
                peer.id in users;
        });
        if (!peers.length) return;

        peers.forEach(function(peer) {
            peer.sendingTrack = track;
        });

        // send data
        var msg = {
            type: 'file',
            data: this.trackData
        };
        for (var j = 0; j < peers.length; j++) {
            peers[j].send(msg);
        }
        // TODO: if we quit DJing, stop streaming to peers
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

    function User(groove, id, conversation) {
        WildEmitter.call(this);
        this.groove = groove;
        this.id = id;
        if (conversation) {
            this.conversation = conversation;
            this.channel = new Reliable(conversation.channel);
            this.channel.onmessage = this._onMessage.bind(this);
        }
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
        this.iconURL = "//www.gravatar.com/avatar/" + md5(id) +
            "?s=80&d=monsterid";
    };

    User.prototype.send = function(msg) {
        this.channel.send(msg);
    };

    User.prototype._onMessage = function(event) {
        switch (event.type) {
        case 'welcome':
            this.setGravatar(event.gravatar);
            this.setName(event.name);
            this.setVote(event.vote);
            if (event.myActiveTrack) {
                // TODO: use this
                this.activeTrack = event.myActiveTrack;
            }
            // receive dj listing from peers already in the room
            if (event.djs && !this.conversation.initiator) {
                var users = this.groove.users;
                var djs = event.djs.map(function(id) { return users[id]; });
                var activeDJ = users[event.djs[event.active]];
                this.groove._negotiateDJs(djs, this, activeDJ);
            }
            break;

        case 'name':
            this.setName(event.name);
            break;

        case 'gravatar':
            this.setGravatar(event.gravatar);
            break;

        case 'vote':
            this.setVote(event.direction);
            break;

        case 'file':
            this._gotFile(event.data);
            break;

        case 'chat':
            this.groove.gotChat(this, String(event.text));
            break;

        case 'track':
            this.groove.gotTrack(this, event.track);
            break;

        case 'nominateDJ':
            var dj = event.user ? this.groove.users[event.user] : this;
            var prevDJ = event.after && this.groove.users[event.after];
            this.groove._acceptDJ(dj, prevDJ);
            break;

        case 'quitDJing':
            this.groove._acceptQuitDJ(this);
            break;

        case 'activeTrack':
            this.groove._negotiateActiveTrack(event.track, this);
            break;

        }
    };

    // got a file
    User.prototype._gotFile = function(buf) {
        var blob = new Blob([buf]);
        var url;
        if (window.createObjectURL) {
            url = window.createObjectURL(blob)
        } else if (window.createBlobURL) {
            url = window.createBlobURL(blob)
        } else if (window.URL && window.URL.createObjectURL) {
            url = window.URL.createObjectURL(blob)
        } else if (window.webkitURL && window.webkitURL.createObjectURL) {
            url = window.webkitURL.createObjectURL(blob)
        }

        console.log('got', blob.size, 'bytes', 'from', this.name, url);
        if (this == this.groove.activeDJ) {
            this.groove.activeTrack.url = url;
            this.groove.emit('activeTrackURL');
            console.log('activeTrackURL');
        } else {
            this.upcomingTrackURL = dataURL;
        }
    };


    // set default icon URL
    User.prototype.updateIconURL();

    window.User = User;
    window.Groove = Groove;
})();
