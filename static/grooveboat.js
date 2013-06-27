(function () {

    function Groove() {
        var self = this;
        WildEmitter.call(this);

        var users = this.users = {};
        var me = this.me = new User();

        this.webrtc = new WebRTC({
            url: 'http://signaling.celehner.com:8888',
            video: false,
            audio: false,
            data: true,
            autoRequestMedia: false,
            peerConnectionConfig: {
                iceServers: [{
                    //"url": "turns:cel@celehner.com:5349"
                    "url": "turn:cel@celehner.com:3478",
                    "credential": ""
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
            self.webrtc.send({
                type: 'name',
                name: me.name
            }, userId);
            self.emit('peerConnected', user);
        });

        this.webrtc.on('dataClose', function (event, conversation) {
            var channel = conversation.channel,
                userId = conversation.id,
                user = users[userId];
            self.emit('peerDisconnected', user);
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

    Groove.prototype.sendChat = function(text) {
        this.webrtc.send({
            type: 'chat',
            text: String(text)
        });
    };

    Groove.prototype._onMessage = function(event, conversation) {
        var channel = conversation.channel,
            userId = conversation.id,
            user = this.users[userId];
        switch (event.type) {
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
        }
    };

    function User(id) {
        WildEmitter.call(this);
        this.id = id;
    }

    User.prototype = Object.create(WildEmitter.prototype, {
        constructor: {value: User}
    });

    window.User = User;
    window.Groove = Groove;
})();
