var Emitter = require('wildemitter');
var md5 = require('md5-jkmyers');
var PeerConnection = require('rtcpeerconnection');

// PeerConnection config and constraints
var peerConnectionConfig = {
    iceServers: [{
        urls: "stun:stun.services.mozilla.com"
    }, {
        urls: "turn:grooveboat.com",
        username: "grooveboat",
        credential: "nautical"
    }]
};
var constraints = {
    mandatory: {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: false,
    },
    optional: [{
        googIPv6: true
    }]
};
var offerConstraints = {
};

function User(groove, id) {
    Emitter.call(this);
    this.groove = groove;
    this.id = id;
}

User.maxNameLength = 32;

User.prototype = Object.create(Emitter.prototype, {
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
    var previous = this.vote;
    this.vote = direction < 0 ? -1 : direction > 0 ? 1 : 0;
    this.emit('vote', previous, this.vote);
};

User.prototype.setGravatar = function(gravatar) {
    this.gravatar = gravatar;
    this.updateIconURL();
    this.emit('gravatar');
};

User.prototype.updateIconURL = function() {
    var id = this.gravatar || this.name || "";
    if (this.gravatarId == id) return;
    this.gravatarId = id;
    this.iconURL = "//www.gravatar.com/avatar/" + md5(id) +
        "?s=80&d=monsterid";
};

User.prototype.send = function(msg) {
    this.groove.webrtc.send(msg, this.id);
};

// send data via server
User.prototype.send = function (data) {
    this.groove.buoy.send('sendTo', {
        to: this.id,
        msg: data
    });
};

// receive data from user via server
User.prototype.handleMessage = function (data) {
    switch(data.type) {
        case 'offer':
            if (!data.offer) return console.error('Missing offer');
            this.handleOffer(data.offer);
            break;
        case 'answer':
            if (!data.answer) return console.error('Missing answer');
            this.handleAnswer(data.answer);
            break;
        case 'ice':
            if (!data.candidate) return console.error('Missing candidate');
            this.handleIce(data.candidate);
    }
};

// create peerconnection and send offer
User.prototype.preparePeerConnection = function() {
    if (!window.RTCPeerConnection) {
        console.error("RTCPeerConnection not supported");
        return;
    }
    if (this.pc) {
        console.log('Already have peer connection to ' + this.id);
    }
    this.pc = new PeerConnection(peerConnectionConfig, constraints);
    this.pc.on('ice', User_onIce.bind(this));
    this.pc.on('addStream', User_onAddStream.bind(this));
    this.pc.on('removeStream', User_onRemoveStream.bind(this));
    this.pc.on('negotiationNeeded', User_onNegotiationNeeded.bind(this));
    this.pc.on('addChannel', User_onAddChannel.bind(this));
};

User.prototype.offerConnection = function() {
    this.pc.offer(offerConstraints, User_offered.bind(this));
};

// handle an offer from a prospective peer
User.prototype.handleOffer = function(offer) {
    if (!this.pc) this.preparePeerConnection();
    if (this.pc)
        this.pc.handleOffer(offer, User_offerHandled.bind(this));
};

function User_offered(err, offer) {
    if (err) return console.error("Error generating offer", err);
    this.send({
        type: 'offer',
        offer: offer
    });
}

// callback for peerconnection.handleOffer
function User_offerHandled(err) {
    if (err) {
        console.error("Error handling offer", err);
        return;
    }
    this.pc.answerAudioOnly(User_offerAnswered.bind(this));
}

function User_offerAnswered(err, answer) {
    if (err || !answer) {
        console.error("Error answering offer", err);
        return;
    }
    this.send({
        type: 'answer',
        answer: answer
    });
}

// handle an peerconnection answer from a prospective peer
User.prototype.handleAnswer = function(answer) {
    if (!this.pc) {
        console.error("Received answer without peer connection");
        return;
    }
    this.pc.handleAnswer(answer, User_answerHandled.bind(this));
};

function User_answerHandled(err) {
    if (err) throw err;
}

// relay ice candidates from peer connection to user
function User_onIce(candidate) {
    this.send({
        type: 'ice',
        candidate: candidate
    });
}

// handle an ice candidate from a prospective peer
User.prototype.handleIce = function(candidate) {
    if (!this.pc) {
        console.error("Received ice candidate without peer connection");
        return;
    }
    this.pc.processIce(candidate);
};

// add a stream to the peer connection
User.prototype.addStream = function(stream) {
    if (!this.pc) {
        console.error('Attempted to add stream without peer connection');
        return;
    }
    this.pc.addStream(stream);
};

// add a stream to the peer connection
User.prototype.createDataChannel = function(name) {
    if (!this.pc) this.preparePeerConnection();
    if (this.pc) return this.pc.createDataChannel(name, {});
};

User.prototype.startChat = function() {
    this.chatChannel = this.createDataChannel('private_chat');
    if (this.chatChannel)
        this.emit('chatChannel', this.chatChannel);
};

// got a remote audio stream over peer connection
function User_onAddStream(e) {
    if (this != this.groove.activeDJ) {
        console.error('Received stream from non-DJ');
        return;
    }
    this.groove.gotRemoteStream(e.stream);
}



// got a data channel over peer connection
function User_onAddChannel(channel) {
    if (channel.label == 'private_chat') {
        this.chatChannel = channel;

        // defer the event until receiving first message
        var self = this;
        channel.addEventListener("message", function onMessage(e) {
            channel.removeEventListener("message", onMessage, false);
            self.emit('chatChannel', channel);
            setTimeout(channel.dispatchEvent.bind(channel, e), 10);
        }, false);
    }
}

// remove a stream from the peer connection
User.prototype.removeStream = function(stream) {
    if (!this.pc) {
        console.error('Attempted to remove stream without peer connection');
        return;
    }
    if (!stream) {
        console.error('Attempted to remove null stream');
        return;
    }
    // our PeerConnection doesn't expose the underlying removeStream method
    if (this.pc.pc) {
        try {
            this.pc.pc.removeStream(stream);
        } catch(e) {
            console.error(e);
        }
    }
};

// remote audio stream over peer connection closed
function User_onRemoveStream() {
    console.log("stream removed");
}

// (re-)negotiate the peer connection
function User_onNegotiationNeeded() {
    if (this.pc.pc.signalingState == 'stable') {
        this.offerConnection();
    } else {
        console.log('signaling state', this.pc.pc.signalingState);
    }
}

User.prototype.closePeerConnection = function() {
    if (this.pc) {
        this.pc.close();
    }
};

// set default icon URL
User.prototype.updateIconURL();

module.exports = User;
