(function () {
    var isChrome = 'WebKitPoint' in window;

    function Groove() {
        var self = this;
        WildEmitter.call(this);

        var users = this.users = {};
        var djs = this.djs = [];
        this.activeDJ = null;

        var me = this.me = new User();
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
                user = users[userId] = new User(userId);
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
                user.dj = false;
                djs.splice(djs.indexOf(user), 1);
                self.emit('djs', djs.slice());
            }
        });

        this.webrtc.on('dataError', function (event, conversation) {
            var channel = conversation.channel,
                userId = conversation.id,
                user = users[userId];
            console.error('data error', channel, userId);
            self.emit('peerError', user);
        });

        this.webrtc.on('dataMessage', function (event, conversation) {
            self._onMessage(event, conversation);
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

    Groove.prototype._welcomeUser = function(user) {
        this.webrtc.send({
            type: 'welcome',
            name: this.me.name,
            gravatar: this.me.gravatar,
            vote: this.me.vote,
            djs: this.djs.filter(Boolean)
                .map(function(user) { return user.id; }),
            active: this.activeDJ ? this.djs.indexOf(this.activeDJ) : -1
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
        this.djs.splice(i, 1);
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
        this.activeDJ = activeDJ;
        this.emit('djs', this.djs.slice());
        this.emit('activeDJ', activeDJ);
        console.log('got dj list', djs, 'from', sender.name);
    };

    Groove.prototype.isDJUp = function(user) {
    };

    Groove.prototype._acceptActiveTrack = function(track, user) {
        // remember the track they are sending, in case they become dj
        user.activeTrack = track;
        if (user == this.activeDJ) {
            this.activeTrack = track;
            this.emit('activeTrack');
        }
    };

    Groove.prototype._onMessage = function(event, conversation) {
        var channel = conversation.channel,
            userId = conversation.id,
            users = this.users,
            user = users[userId];
        switch (event.type) {
        case 'welcome':
            user.setName(event.name);
            user.setGravatar(event.gravatar);
            user.setVote(event.vote);
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
            this._acceptActiveTrack(event.track, user);
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
        this.playlists[this.activePlaylist].push(track);
        this.emit('queueUpdate');
        next();
    }

    function grooveProcessFile(files, i) {
        var file = files[i];
        console.log('file', file);
        if (file) ID3v2.parseFile(file, grooveFileParsed.bind(this, file,
            grooveProcessFile.bind(this, files, i+1)));
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
    };

    function User(id) {
        WildEmitter.call(this);
        this.id = id;
        this.updateIconURL();
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
        var id = this.gravatar || this.name || this.id || "";
        this.iconURL = "//www.gravatar.com/avatar/"+ md5(id) +"?s=80&d=monsterid";
    };

    window.User = User;
    window.Groove = Groove;
})();
