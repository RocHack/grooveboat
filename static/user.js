/* global WildEmitter, PeerConnection, md5 */
(function() {

    // PeerConnection config and constraints
    var isChrome = 'WebKitPoint' in window;
    var peerConnectionConfig = {
        iceServers: [{
            "url": isChrome ?
                "stun:stun.l.google.com:19302" : "stun:124.124.124.2"
        }, {
            url: "turn:grooveboat@celehner.com",
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
        var previous = this.vote;
        this.vote = direction < 0 ? -1 : direction > 0 ? 1 : 0;
        this.emit('vote', previous, this.vote);
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
        this.groove.webrtc.send(msg, this.id);
    };

    User.prototype._gotChunkStart = function(event) {
        this.incomingFilename = event.name;
        this.numChunks = event.numChunks | 0;
        this.incomingChunks = new Array(this.numChunks);
    };

    User.prototype._gotChunk = function(event) {
        if (Math.random() < 0.01) {
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

    User.prototype._gotDataURL = function(dataURL) {
        console.log('got data url of length', dataURL.length,
            'from', this.name);
        if (this == this.groove.activeDJ) {
            this.groove.activeTrack.url = dataURL;
            this.groove.emit('activeTrackURL');
            // start preloading next track
            //this.groove.requestNextTrack();
        } else {
            this.upcomingTrackURL = dataURL;
        }
        this._cleanupChunks();
    };

    User.prototype.requestFile = function(trackType) {
        console.log('requesting next track from', this.id);
        this.send({
            type: 'requestTrack',
            track: trackType
        });
    };

    User.prototype._gotTrackDuration = function(duration) {
        console.log('got track duration', duration);
        if (this == this.groove.activeDJ) {
            this.activeTrack.duration = duration;
        }
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
        if (this.pc) {
            console.error('Already have peer connection to ' + this.id);
        }
        this.pc = new PeerConnection(peerConnectionConfig, constraints);
        this.pc.on('ice', User_onIce.bind(this));
    };

    User.prototype.offerConnection = function() {
        this.pc.offer(offerConstraints, User_offered.bind(this));
    };

    // handle an offer from a prospective peer
    User.prototype.handleOffer = function(offer) {
        if (!this.pc) {
            console.error("Received offer without peer connection");
            return;
        }
        this.pc.handleOffer(offer, User_offerHandled.bind(this));
    };

    function User_offered(err, offer) {
        if (err) return console.error("Error generating offer", err);
        console.log('sending offer', offer);
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
        console.log('Handling answer');
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
        console.log('Handling ice', candidate.candidate);
        this.pc.processIce(candidate);
    };

    // set default icon URL
    User.prototype.updateIconURL();

    window.User = User;

})();
