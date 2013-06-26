(function () {

    function Groove() {
        var self = this;
        WildEmitter.call(this);

        var users = {};

        this.webrtc = new WebRTC({
            url: 'http://signaling.celehner.com:8888',
            video: false,
            audio: false,
            data: true,
            autoRequestMedia: false,
            log: true,
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
            self.id = id;
        });

        this.webrtc.on('dataOpen', function (event, conversation) {
            var channel = conversation.channel,
                userId = conversation.id;
            self.emit('peerConnected', userId);

            this.users[userId] = new User(userId, channel);
        });

        this.webrtc.on('dataClose', function (event, conversation) {
            var channel = conversation.channel,
                userId = conversation.id;
            self.emit('peerDisconnected', userId);
        });

        this.webrtc.on('dataError', function (event, conversation) {
            var channel = conversation.channel,
                userId = conversation.id;
            console.error('data error', channel, userId);
            self.emit('peerError', userId);
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
            text: text
        });
    };

    Groove.prototype._onMessage = function(event, conversation) {
        var channel = conversation.channel,
            userId = conversation.id;
        switch (event.type) {
        case 'nick':
            this.emit('nick', {
                nick: event,
                user: userId
            });
            break;
        case 'chat':
            this.emit('chat', {
                text: event.text,
                user: userId
            });
            break;
        case 'bop':
            this.emit('bop', {
                bopping: !!event,
                user: userId
            });
            break;
        case 'track':
            this.emit('track', {
                track: event,
                user: userId
            });
            break;
        }
    };

    function User() {
        this.nickname = "Guest" +  Math.random();
    }

    window.User = User;
    window.Groove = Groove;
})();
