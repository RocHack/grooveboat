var AudioContext = window.AudioContext || window.webkitAudioContext;

function Player() {
    this.audio = new Audio();
    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
}

Player.prototype.muted = false;
Player.prototype.volume = 1;

Player.prototype.playTrack = function(track) {
    if (track != this.track) {
        // stop previously playing track
        this.stop();
    }
    this.track = track;
    if (!track) {
        return;
    }

    if (track.stream) {
        this.audio.src = URL.createObjectURL(track.stream);
        this.audio.play();

    } else if (track.mediaSource) {
        this.mediaSource = track.mediaSource;
        this.mediaSource.connect(this.gainNode);

    } else {
        console.error('Unknown track type', track);
    }
};

Player.prototype.stop = function() {
    this.track = null;

    this.audio.pause();

    if (this.mediaSource) {
        this.mediaSource.disconnect();
        this.mediaSource.stop(0);
        this.mediaSource = null;
    }
};

Player.prototype.setMuted = function(muted) {
    this.muted = muted;
    this.audio.muted = muted;
    this.gainNode.gain.value = muted ? 0 : this.volume;
};

// set volume of local (DJ's) stream
Player.prototype.setVolume = function(volume) {
    this.volume = volume;
    this.gainNode.gain.value = this.muted ? 0 : volume;
    this.audio.volume = volume;
};

module.exports = Player;
