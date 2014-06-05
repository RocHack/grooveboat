var Ractive = require("ractive/build/ractive.runtime");

module.exports = Ractive.extend({
    template: require("../templates/main.html"),
    partials: {
        overlay: require("../templates/overlay.html")
    },

    data: {
        currentOverlay: false,
        tempGravatarEmail: null,
        tempUsername: null,
        muted: false
    },

    computed: {
        trimmedTempUsername: function() {
            var tempUsername = this.get('tempUsername');
            return tempUsername && tempUsername.trim();
        }
    },

    init: function(options) {
        this.groove = options.groove;
        this.router = options.router;

        var persist = localStorage["user:persist"];
        this.set('persistPlaylists', persist);
        this.groove.setPersist(persist);

        this.set('tempGravatarEmail', this.groove.me.gravatar);
        this.set('tempUsername', this.groove.me.name);

        this.on(this.eventHandlers);
        this.observe(this.observers);

        var buoy = this.groove.buoy;
        buoy.on('disconnected', this.setOverlay.bind(this, 'disconnected'));
        buoy.on('reconnected', this.clearOverlay.bind(this));

        var db = this.groove.db;
        db.on('blocked', this.setOverlay.bind(this, 'blocked'));
        db.on('open', this.clearOverlay.bind(this, 'blocked'));
    },

    observers: {
        'persistPlaylists': function(persist) {
            localStorage['user:persist'] = persist;
            this.groove.setPersist(persist);
        }
    },

    eventHandlers: {
        setOverlay: function(e, overlay) {
            this.setOverlay(overlay);
        },

        clearOverlay: function() {
            this.clearOverlay();
        },

        saveSettings: function() {
            // Gravatar
            var email = this.get('tempGravatarEmail');
            if (email) {
                this.groove.me.setGravatar(email);
                localStorage["user:gravatar"] = this.groove.me.gravatar;
            }

            // Name
            var username = this.get('trimmedTempUsername');
            if (username) {
                this.groove.me.setName(username);
                localStorage["user:name"] = username;
            }
            this.set('tempUsername', this.groove.me.name);
            this.setOverlay(null);
        },

        toggleMute: function() {
            this.toggle('muted');
        },

        togglePersistTracks: function() {
            this.toggle('persistPlaylists');
        }
    },

    setOverlay: function(overlay) {
        this.set('currentOverlay', overlay);
    },

    clearOverlay: function(overlay) {
        if (!overlay || this.get('currentOverlay') == overlay) {
            this.set('currentOverlay', false);
        }
    }
});
