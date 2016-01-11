var Ractive = require('ractive/ractive.runtime');
var PrivateChat = Ractive.extend(require('./privatechat'));
var trackIsEqual = require('../groovedb').trackIsEqual;

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function subtract(arr1, arr2) {
    return !arr1 ? [] : !arr2 ? arr1 : arr1.filter(function(item) {
        return arr2.indexOf(item) == -1;
    });
}

var noDjMessages = [
    "Why not Zoidberg?",
    "You could be next",
    "Show the room some love",
    "*crickets*",
    "*tumbleweed rolls across the stage*",
    "We'll just be waiting...",
    "*zzz*",
    "*jeopardy thinking music*",
    "Get 'er done!",
    "I like music",
    "*whistles*",
];

module.exports = Ractive.extend({
    template: require("../templates/room.html"),
    partials: {track: require("../templates/track.html")},

    data: function () {
        return {
            users: [],
            djs: [],
            currentTab: null,
            currentTrack: null,
            activeDJ: null,
            votes: {yes: 0, no: 0},
            newMessages: false,
            searchResults: [],

            messageToHTML: PrivateChat.prototype.messageToHTML,

            hasTrack: function(track) {
                return this.groove.hasTrack(track, this.groove.activePlaylist);
            },

            formatDuration: function(ms) {
                if (!ms) return '';
                var sec = Math.round(ms/1000);
                var min = Math.floor(sec / 60);
                sec %= 60;
                return min + ':' + ('0' + sec).substr(-2);
            }
        };
    },

    computed: {
        audience: function() {
            return subtract(this.get('users'), this.get('djs'));
        },

        isDJ: function() {
            return this.get('djs').indexOf(this.get('me')) != -1;
        },

        isActiveDJ: function() {
            return this.get('activeDJ') == this.get('me');
        },

        joinText: function() {
            return this.get('isDJ') ? 'step down' : 'become a dj';
        },

        msgPlaceholder: function() {
            return this.get('newMessageFocused') ? '' : 'send a message';
        }
    },

    soundEffects: {
        ping: new Audio("/static/ping.wav")
    },

    /*
     * Listeners on the UI
     */
    onconstruct: function(options) {
        var self = this;
        this.groove = options.groove;
        this.router = options._router;
        this.app = options.app;
        this.room = options.room;
        this.storage = options.storage;
        this.groove.joinRoom(this.room);

        this.privateChats = {};

        // bind some handlers
        this.updateUsers = function() {
            self.update('users');
        };
        this.gotChatChannel = function(channel) {
            self.gotUserChatChannel(this, channel);
        };

        this.watchUser(this.groove.me);

        this.on(this.eventHandlers);

        /*
        * Listeners from the buoy server
        */
        for (var event in this.grooveEventHandlers) {
            var handler = this.grooveEventHandlers[event].bind(this);
            this.groove.on(event, this, handler);
        }
    },

    onrender: function() {
        this.observer = this.observe(this.observers);
        this.appObserver = this.app.observe({
            // proxy some keypaths
            muted: this.set.bind(this, 'muted')
        });

        this.set({
            djs: [],
            files: [],
            users: [this.groove.me],
            me: this.groove.me,
            chat_messages: [],
            currentTab: this.storage.get('user:tab') || 'music',
            tracks: this.groove.playlists[this.groove.activePlaylist].slice(),
        });

        // periodically pick a random no-DJ message
        this.pickNoDjMessage();
        this.pickInterval =
            setInterval(this.pickNoDjMessage.bind(this), 30 * 1000);
    },

    onunrender: function() {
        this.observer.cancel();
        this.appObserver.cancel();
        clearTimeout(this.pickInterval);
    },

    onteardown: function() {
        this.groove.leaveRoom();
        this.groove.releaseGroup(this);
    },

    observers: {
        currentTab: function(tab) {
            this.storage.set("user:tab", tab);
        },

        files: function() {
            var files = this.get('files');
            if (files) this.groove.addFilesToQueue(files);
        },

        muted: function(muted) {
            this.groove.player.setMuted(muted);
        },

        tracks: function() {
            var tracks = this.get('tracks');
            if (tracks && tracks._dragging) {
                tracks._dragging = false;
                this.groove.setPlaylist(this.groove.activePlaylist, tracks);
            }
        }
    },

    eventHandlers: {
        switchTab: function(e, tab) {
            if (tab == 'chat' && this.get('newMessages')) {
                this.set('newMessages', false);
            }
            this.set('currentTab', tab);
        },

        clickUser: function(e) {
            var user = e.context;
            if (user == this.groove.me) {
                this.app.setOverlay('settings');
            } else {
                var chat = this.privateChats[user.id];
                if (chat) {
                    chat.focus();
                } else {
                    user.startChat();
                }
            }
        },

        newMessage: function(e) {
            e.original.preventDefault();

            var text = this.get('message_text');
            var last = this.groove.lastChatAuthor;
            var me = this.groove.me;

            if (text && text.trim()) {
                this.get('chat_messages').push({
                    from: me,
                    text: text,
                    isContinuation: last && last == me
                });
                this.groove.lastChatAuthor = me;
                this.groove.sendChat(text);
            }

            this.pruneChat();
            this.set('message_text', '');
        },

        becomeDJ: function() {
            if (this.get('tracks').length === 0) {
                this.app.setOverlay("no-tracks");
                return;
            }

            if (!this.groove.me.dj) {
                this.groove.becomeDJ();
            } else {
                this.groove.quitDJing();
            }
        },

        skipSong: function() {
            this.groove.skip();
        },

        queueFiles: function(e) {
            this.groove.addFilesToQueue(e.files);
        },

        setCurrentlyDragging: function(e, well) {
            this.set('currentlyDragging', well == 'yes');
        },

        deleteTrack: function(e) {
            var i = e.index.i;
            var tracks = this.get('tracks');
            var track = tracks[i];
            this.groove.deleteTrack(this.groove.activePlaylist, track);
        },

        bumpTrack: function(e) {
            var i = e.index.i;
            var tracks = this.get('tracks').slice();
            var track = tracks[i];
            var newIndex = 0;
            if (!track) {
                console.error('Unknown track');
                return;
            }

            // don't bump in front of current track
            if (trackIsEqual(tracks[0], this.groove.activeTrack)) {
                newIndex = 1;
            }

            if (newIndex >= i) {
                // no move to make
                return;
            }

            tracks.splice(i, 1);
            tracks.splice(newIndex, 0, track);

            this.set('tracks', tracks);
            this.groove.setPlaylist(this.groove.activePlaylist, tracks);
        },

        previewTrack: function(e) {
            var keypath = e.keypath + '.previewing';
            var track = e.context;
            if (!track) return;
            var previewing = this.get(keypath);
            this.toggle(keypath);
            if (previewing) {
                this.stopPreviewing();
            } else {
                this.previewTrack(track, function done() {
                    this.set(keypath, false);
                });
            }
        },

        editTrack: function(e) {
            this.set('tracks.' + e.index.i + '.editing', true);
        },

        saveTrack: function(e) {
            this.set('tracks.' + e.index.i + '.editing', false);

            this.groove.savePlaylist(this.groove.activePlaylist);
        },

        vote: function(e, direction) {
            if (this.groove.activeDJ == this.groove.me) {
                return;
            }

            this.groove.vote(+direction);
        },

        newMessageFocus: function() {
            this.set('newMessageFocused', true);
        },

        newMessageBlur: function() {
            this.set('newMessageFocused', false);
        },

        trackSearch: function() {
            this.search();
        },

        trackSearchType: function() {
            // debounce
            if (this.inputTimer) {
                clearTimeout(this.inputTimer);
            }
            this.inputTimer = setTimeout(this.search.bind(this), 500);
        },

        addTrack: function(e) {
            var track = e.context;
            if (!track) return;
            this.groove.addTrack(track);
            this.update('searchResults');
        }
    },

    events: require('../events'),

    decorators: {
        sortable: require('../sortable'),
        autoscroll: require('../autoscroll')
    },

    grooveEventHandlers: {
        chat: function(message) {
            if (this.get('currentTab') != 'chat') {
                this.set('newMessages', true);
            }

            if (message.text.indexOf(this.groove.me.name) != -1) {
                this.playSoundEffect('ping');
            }

            var last = this.groove.lastChatAuthor;
            message.isContinuation = (last && last == message.from);
            this.groove.lastChatAuthor = message.from;
            this.get('chat_messages').push(message);
            this.pruneChat();
        },

        peerConnected: function(user) {
            this.get('users').push(user);
            this.watchUser(user);
            this.updateVotes();
        },

        peerDisconnected: function(user) {
            var i = this.get('users').indexOf(user);
            if (i == -1) return;
            this.get('users').splice(i, 1);
            delete this.privateChats[user.id];
            // groove might not yet realize the user has disconnected, so reset
            // their vote here for recalculation purposes
            user.vote = 0;
            this.updateVotes();
        },

        reconnected: function() {
            this.set({
                users: [this.groove.me],
                djs: []
            });
            // Remind the server of who/where we are
            this.groove.me.setName(this.groove.me.name);
            this.groove.me.setGravatar(this.groove.me.gravatar);
            this.groove.joinRoom(this.room);
        },

        setVote: function() {
            this.updateVotes();
            this.update('users');
        },

        playlistUpdated: function(playlistName) {
            this.set('tracks', this.groove.playlists[playlistName].slice());
        },

        djs: function() {
            this.set('djs', this.groove.djs.slice());
        },

        activeDJ: function() {
            this.set('activeDJ', this.groove.activeDJ);
        },

        activeTrack: function() {
            this.set('currentTrack', this.groove.activeTrack);
        },

        activeTrackDuration: function() {
            // console.log('Duration!', groove.activeTrack.duration);
        },

        currentTrackTime: function() {
            // console.log('Current time!', groove.getCurrentTrackTime());
        },

        emptyPlaylist: function() {
            alert('Add some music to your playlist first.');
        }
    },

    pickNoDjMessage: function() {
        this.set('noDjMessage', pick(noDjMessages));
    },

    updateVotes: function() {
        this.set('votes', this.groove.getVotes());
    },

    watchUser: function(user) {
        // TODO: unbind these somewhere
        user.on('name', this.updateUsers);
        user.on('vote', this.updateUsers);
        user.on('gravatar', this.updateUsers);
        user.on('chatChannel', this.gotChatChannel);
    },

    pruneChat: function() {
        var msgs = this.get('chat_messages');
        if (msgs.length > 76) {
            msgs.splice(0, msgs.length - 75);
        }
    },

    playSoundEffect: function(sound) {
        if (this.get('muted')) return;
        var a = this.soundEffects[sound];
        a.pause();
        a.currentTime = 0;
        a.play();
    },

    gotUserChatChannel: function(user, chan) {
        var pc = this.privateChats[user.id];
        if (!pc) {
            pc = this.privateChats[user.id] = new PrivateChat({
                el: this.nodes.private_chats,
                append: true,
                peer: user,
                me: this.groove.me
            });
            pc.focus();
            var onTeardown = pc.on('teardown', function() {
                delete this.privateChats[user.id];
                onTeardown.cancel();
            }.bind(this));
        }
        pc.set('channel', chan);
    },

    previewTrack: function(track, onDone) {
        this.groove.ensureTrackFile(track, function() {
            this.groove.player.previewTrack(track, onDone.bind(this));
        }.bind(this));
    },

    stopPreviewing: function() {
        this.groove.player.previewTrack(null);
    },

    search: function() {
        clearTimeout(this.inputTimer);
        var query = this.get('searchTerm');
        if (!query) {
            this.set('searching', false);
            return;
        }
        this.groove.searchTracks(query, this._gotSearchResults.bind(this));
    },

    _gotSearchResults: function(tracks) {
        this.set('searching', true);
        this.set('searchResults', tracks);
    }
});
