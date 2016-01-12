var Ractive = require("ractive/ractive.runtime");

module.exports = Ractive.extend({
    template: require("../templates/main.html"),

    data: function () {
        return {
            currentOverlay: false,
            persistPlaylists: false,
            tempGravatarEmail: null,
            tempUsername: null,
            muted: false
        };
    },

    computed: {
        trimmedTempUsername: function() {
            var tempUsername = this.get('tempUsername');
            return tempUsername && tempUsername.trim();
        }
    },

    onconstruct: function(options) {
        this.groove = options.groove;
        this.router = options.router;
        this.storage = options.storage;

        this.on(this.eventHandlers);

        this.groove.buoy.on('disconnected', this,
            this.setOverlay.bind(this, 'disconnected'));
        this.groove.buoy.on('reconnected', this,
            this.clearOverlay.bind(this, 'disconnected'));
        this.groove.db.on('blocked', this,
            this.setOverlay.bind(this, 'blocked'));
        this.groove.db.on('open', this,
            this.clearOverlay.bind(this, 'blocked'));

        this.onWindowFocus = this.set.bind(this, {windowFocused: true}),
        this.onWindowBlur = this.set.bind(this, {windowFocused: false}),
        window.addEventListener("focus", this.onWindowFocus, false);
        window.addEventListener("blur", this.onWindowBlur, false);
    },

    onrender: function() {
        this.set({
            persistPlaylists: !!this.storage.get("user:persist"),
            tempGravatarEmail: this.groove.me.gravatar,
            tempUsername: this.groove.me.name
        });

        this.observer = this.observe(this.observers);
    },

    onunrender: function() {
        this.observer.cancel();
    },

    onteardown: function() {
        this.groove.buoy.releaseGroup(this);
        this.groove.db.releaseGroup(this);
        window.removeEventListener("focus", this.onWindowFocus, false);
        window.removeEventListener("blur", this.onWindowBlur, false);
    },

    observers: {
        persistPlaylists: function(persist) {
            this.storage.set('user:persist', persist || '');
            this.groove.setPersist(persist);
        },

        muted: function(muted) {
            this.groove.player.setMuted(muted);
        }
    },

    eventHandlers: {
        setOverlay: function(e, overlay) {
            this.setOverlay(overlay);
        },

        clearOverlay: function() {
            this.clearOverlay();
        },

        saveSettings: function(e) {
            e.original.preventDefault();

            // Gravatar
            var email = this.get('tempGravatarEmail');
            if (email) {
                this.groove.me.setGravatar(email);
                this.storage.set("user:gravatar", this.groove.me.gravatar);
            }

            // Name
            var username = this.get('trimmedTempUsername');
            if (username) {
                this.groove.me.setName(username);
                this.storage.set("user:name", username);
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

    soundEffects: {
        ping: new Audio("/static/ping.wav")
    },

    playSoundEffect: function(sound) {
        if (this.get('muted')) return;
        var a = this.soundEffects[sound];
        a.pause();
        a.currentTime = 0;
        a.play();
    },

    backgroundNotify: function notify(title, opts, cb) {
        if (!this.get('windowFocused'))
            this.notify(title, opts, cb);
    },

    notify: function notify(opts, cb) {
        if (!cb) cb = Function.prototype;
        if (Notification.permission == 'granted') {
            cb(new Notification(opts.title, opts));
        } else if (Notification.permission == 'denied') {
            cb(null);
        } else {
            Notification.requestPermission(notify.bind(this, opts, cb));
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
