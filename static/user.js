(function() {

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

    User.prototype._gotDataURL = function(dataURL, filename) {
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

    // set default icon URL
    User.prototype.updateIconURL();

    window.User = User;

})();
