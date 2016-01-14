var AudioContext = window.AudioContext || window.webkitAudioContext;
var trackIsEqual = require('./groovedb').trackIsEqual;

function once(element, eventName, handler, context, bubble) {
    element.addEventListener(eventName, function listener(e) {
        element.removeEventListener(eventName, listener, bubble);
        handler.call(context || this, e);
    }, bubble);
}

function Player() {
    this.audio = new Audio();
    this.audio.onended = Player_onEndPlaying.bind(this);
    if (!AudioContext) {
        console.error('AudioContext not supported');
        return;
    }

    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
}

Player.prototype.muted = false;
Player.prototype.volume = 1;
Player.prototype.previewDuration = 20;

Player.prototype.setMuted = function(muted) {
    this.muted = muted;
    this.audio.muted = muted;
    if (this.gainNode)
        this.gainNode.gain.value = muted ? 0 : this.volume;
};

Player.prototype.setVolume = function(volume) {
    this.volume = volume;
    this.audio.volume = volume;
    if (this.gainNode)
        this.gainNode.gain.value = this.muted ? 0 : volume;
};

function Player_playURL(url, startTime) {
    this.audio.src = url;
    if (startTime) {
        var loadStartTime = Date.now();
        once(this.audio, 'canplay', function() {
            if (startTime < 0) {
                // offset the start time from the middle of the track
                startTime = Math.max(0, (this.audio.duration + startTime) / 2);
            } else {
                // skip time spent loading
                var loadTime = (Date.now() - loadStartTime)/1000;
                startTime += loadTime;
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

    if (track.audioUrl) {
        Player_playURL.call(this, track.audioUrl, startTime);

    } else if (track.stream || track.file) {
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
    this.audio.src = "";
    if (this.mediaSource) {
        // We can't disconnect the media source because it have might remote
        // media stream destinations. So disconnect the gainNode.
        this.gainNode.disconnect();
        this._gainNodeConnected = false;
        this.mediaSource = null;
    }
}

Player.prototype.playTrack = function(track, startTime, onEnded) {
    if (this.previewingTrack) {
        // stop currently previewing track
        Player_stopPreviewing.call(this);
    }
    if (trackIsEqual(track, this.playingTrack)) {
        // already playing this track
        return;
    } else {
        // stop previously playing track
        Player_stop.call(this);
    }
    this.playingTrack = track;
    this._onPlayingTrackEnded = onEnded;
    this._trackPlayStart = Date.now()/1000 - startTime;
    Player_play.call(this, startTime);
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
            Player_play.call(this, this.getPlayStartTime());
        }
        return;
    }

    // Play a clip from the given track
    this.previewingTrack = track;

    // If we have the track file, play the preview from the middle.
    // If we have to download the track, play the preview from the beginning.
    var startTime = track.duration ? 0 : -this.previewDuration;
    Player_play.call(this, startTime);

    // Restore the regularly playing track when the preview is finished.
    if (this._endPreviewTimer) {
        clearTimeout(this._endPreviewTimer);
    }
    this._endPreviewTimer = setTimeout(Player_onEndPreview.bind(this),
        this.previewDuration * 1000);
    this._endPreviewCb = cb;
};

Player.prototype.getPlayStartTime = function() {
    return Date.now()/1000 - this._trackPlayStart;
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
        Player_play.call(this, this.getPlayStartTime());
    }
}

function Player_onEndPlaying() {
    if (this._onPlayingTrackEnded) {
        this._onPlayingTrackEnded.call(this);
        this._onPlayingTrackEnded = null;
    }
}

module.exports = Player;
