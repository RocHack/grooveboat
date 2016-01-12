var soundCloudClientId = 'ef44c57ca5d4d98885bf7fb38da7492a';

var SoundCloud = {};

SoundCloud.search = function(query, cb) {
    if (this.xhr) this.xhr.abort();
    var xhr = this.xhr = new XMLHttpRequest();
    var url = 'https://api.soundcloud.com/tracks?client_id=' +
        soundCloudClientId + '&filter=streamable&format=json&q=' +
        encodeURIComponent(query);
    xhr.open('GET', url, true);
    xhr.onerror = function(e) {
        console.error('SoundCloud fetch error', e);
    };

    xhr.onload = function() {
        var resp;
        try {
            resp = JSON.parse(xhr.responseText);
            if (resp.errors) {
                console.error('SoundCloud errors', resp.errors);
            }
        } catch(e) {
            console.error('SoundCloud JSON error', e);
        }

        if (!resp) cb([]);
        else cb(resp.filter(function(track) {
            return track.streamable;
        }).map(function(track) {
            return {
                id: 'soundcloud_' + track.id,
                title: track.title,
                artist: track.user.username,
                artistUrl: track.user.permalink_url,
                audioUrl: track.stream_url + '?client_id=' +
                    soundCloudClientId,
                duration: track.duration,
                url: track.permalink_url,
                iconURL: track.artwork_url
            };
        }));
    };
    xhr.send(null);
};

module.exports = SoundCloud;
