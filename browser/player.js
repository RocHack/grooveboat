var AudioContext = window.AudioContext || window.webkitAudioContext;

function once(element, eventName, handler, context, bubble) {
    element.addEventListener(eventName, function listener(e) {
        element.removeEventListener(eventName, listener, bubble);
        handler.call(context || this, e);
    }, bubble);
}

function Player() {
    this.audio = new Audio();
    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
}

Player.prototype.muted = false;
Player.prototype.volume = 1;
Player.prototype.previewDuration = 20;

Player.prototype.setMuted = function(muted) {
    this.muted = muted;
    this.audio.muted = muted;
    this.gainNode.gain.value = muted ? 0 : this.volume;
};

Player.prototype.setVolume = function(volume) {
    this.volume = volume;
    this.gainNode.gain.value = this.muted ? 0 : volume;
    this.audio.volume = volume;
};

function Player_playURL(url, startTime) {
    this.audio.src = url;
    if (startTime) {
        once(this.audio, 'canplaythrough', function() {
            if (startTime < 0) {
                // offset the start time from the middle of the track
                startTime = Math.max(0, (this.audio.duration + startTime) / 2);
            }
            this.audio.currentTime = startTime;
            this.audio.play();
        }, this);
    } else {
        this.audio.play();
    }
}

function Player_playMediaStream(ms) {
    this.mediaSource = ms;
    if (ms._connectedGainNode != this.gainNode) {
        ms._connectedGainNode = this.gainNode;
        this.mediaSource.connect(this.gainNode);
    }
    if (!this._gainNodeConnected) {
        this._gainNodeConnected = true;
        this.gainNode.connect(this.audioContext.destination);
    }
}

function Player_play(startTime) {
    var track = this.previewingTrack || this.playingTrack;
    if (!track) return;

    if (track.stream || track.file) {
        var url = URL.createObjectURL(track.stream || track.file);
        Player_playURL.call(this, url, startTime);

    } else if (track.mediaSource) {
        Player_playMediaStream.call(this, track.mediaSource);

    } else {
        console.error('Unknown track type', track);
    }
}

function Player_stop() {
    this.audio.pause();
    if (this.mediaSource) {
        // We can't disconnect the media source because it have might remote
        // media stream destinations. So disconnect the gainNode.
        this.gainNode.disconnect();
        this._gainNodeConnected = false;
        this.mediaSource = null;
    }
}

Player.prototype.playTrack = function(track) {
    this.playingTrack = track;
    if (this.previewingTrack) {
        // stop currently previewing track
        Player_stopPreviewing.call(this);
    }
    if (track != this.playingTrack) {
        // stop previously playing track
        Player_stop.call(this);
    }
    Player_play.call(this, 0);
};

Player.prototype.previewTrack = function(track, cb) {
    if (this.previewingTrack) {
        // stop previously previewing track
        Player_stopPreviewing.call(this);
    } else if (this.playingTrack) {
        // stop previously playing track
        Player_stop.call(this);
    }
    if (!track) {
        if (this.playingTrack) {
            // allow previously playing track to continue
            Player_play.call(this, 0);
        }
        return;
    }

    // Play a clip from the given track
    this.previewingTrack = track;
    Player_play.call(this, -this.previewDuration);
    // Restore the regularly playing track
    if (this._endPreviewTimer) {
        clearTimeout(this._endPreviewTimer);
    }
    this._endPreviewTimer = setTimeout(Player_onEndPreview.bind(this),
        this.previewDuration * 1000);
    this._endPreviewCb = cb;
};

function Player_stopPreviewing() {
    if (this._endPreviewTimer) {
        clearTimeout(this._endPreviewTimer);
        this._endPreviewTimer = null;
    }
    if (this._endPreviewCb) {
        this._endPreviewCb();
        this._endPreviewCb = null;
    }
    this.previewingTrack = null;
    Player_stop.call(this);
}

function Player_onEndPreview() {
    Player_stopPreviewing.call(this);
    if (this.playingTrack) {
        Player_play.call(this, 0);
    }
}

module.exports = Player;
