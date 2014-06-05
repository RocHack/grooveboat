var Ractive = require("ractive/build/ractive.runtime");

module.exports = Ractive.extend({
    template: require("../templates/main.html"),

    data: {
        currentOverlay: false,
        persistPlaylists: false,
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

        this.set({
            persistPlaylists: !!localStorage["user:persist"],
            tempGravatarEmail: this.groove.me.gravatar,
            tempUsername: this.groove.me.name
        });

        this.on(this.eventHandlers);
        this.observe(this.observers);

        this.groove.buoy.on('disconnected', this, this.setOverlay.bind(this, 'disconnected'));
        this.groove.buoy.on('reconnected', this, this.clearOverlay.bind(this, 'disconnected'));
        this.groove.db.on('blocked', this, this.setOverlay.bind(this, 'blocked'));
        this.groove.db.on('open', this, this.clearOverlay.bind(this, 'blocked'));
    },

    observers: {
        persistPlaylists: function(persist) {
            localStorage['user:persist'] = persist || '';
            this.groove.setPersist(persist);
        }
    },

    eventHandlers: {
        teardown: function() {
            this.groove.buoy.releaseGroup(this);
            this.groove.db.releaseGroup(this);
        },

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
