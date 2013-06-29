(function () {
    var isChrome = 'WebKitPoint' in window;

    function Groove() {
        var self = this;
        WildEmitter.call(this);

        var users = this.users = {};
        var djs = this.djs = [];
        var me = this.me = new User();
        me.isLocal = true;

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
            self.emit('peerDisconnected', user);
            if (user.dj) {
                user.dj = false;
                self.djs.splice(self.djs.indexOf(user), 1);
                self.emit('djs', self.djs.slice());
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

        var self = this;
        setTimeout(function() {
            self._acceptDJ(self.me, after);
        });
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

    Groove.prototype._onMessage = function(event, conversation) {
        var channel = conversation.channel,
            userId = conversation.id,
            users = this.users,
            user = users[userId];
        switch (event.type) {
        case 'welcome':
            user.name = event.name;
            user.emit('name', event.name);
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
            user.name = event.name;
            user.emit('name', event.name);
            break;

        case 'chat':
            this.emit('chat', {
                text: String(event.text),
                from: user
            });
            break;

        case 'bop':
            this.emit('bop', {
                bopping: event.bopping,
                user: user
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
        }
    };

    function User(id) {
        WildEmitter.call(this);
        this.id = id;
    }

    User.prototype = Object.create(WildEmitter.prototype, {
        constructor: {value: User}
    });

    User.prototype.local = false;

    window.User = User;
    window.Groove = Groove;
})();
