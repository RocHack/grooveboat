var Ractive = require('ractive/build/ractive.runtime');
require('../lib/ractive-events-keys');
var emoji = require('emoji-images');
var linkify = require('html-linkify');

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function subtract(arr1, arr2) {
    return arr1.filter(function(item) {
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
];

module.exports = Ractive.extend({
    template: require("../templates/room.html"),

    data: {
        currentTab: null,
        currentTrack: null,
        activeDJ: null,
        votes: {yes: 0, no: 0},
        newMessages: false,

        messageToHTML: function(text) {
            // sanitize html
            text = linkify(text);
            // render emoji
            text = emoji(text, '/static/img/emoji');
            // highlight mentions
            var myName = this.groove.me.name;
            return text.replace(myName,
                '<span class="mention">' + myName + '</span>');
        }
    },

    computed: {
        audience: function() {
            return subtract(this.get('users'), this.get('djs'));
        },

        isActiveDJ: function() {
            return this.get('activeDJ') == this.get('me');
        },

        joinText: function() {
            return this.get('isActiveDJ') ? 'step down' : 'become a dj';
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
    init: function(options) {
        this.groove = options.groove;
        this.router = options.router;
        this.app = options.app;
        this.room = options.room;
        this.groove.joinRoom(this.room);

        this.set({
            djs: [],
            files: [],
            users: [this.groove.me],
            me: this.groove.me,
            chat_messages: [],
            currentTab: localStorage['user:tab'] || 'music',
            tracks: this.groove.playlists[this.groove.activePlaylist],
        });

        this.updateUsers = function() {
            this.update('users');
        }.bind(this);

        this.watchUser(this.groove.me);

        this.player = document.createElement('audio');
        window.player = this.player;  // for debugging

        this.on(this.eventHandlers);
        this.observe(this.observers);

        this.appObservers = this.app.observe({
            // proxy some keypaths
            muted: this.set.bind(this, 'muted')
        });

        // periodically pick a random no-DJ message
        this.pickNoDjMessage();
        this.pickInterval =
            setInterval(this.pickNoDjMessage.bind(this), 30 * 1000);

        /*
        * Listeners from the buoy server
        */
        for (var event in this.grooveEventHandlers) {
            var handler = this.grooveEventHandlers[event].bind(this);
            this.groove.on(event, this, handler);
        }
    },

    observers: {
        currentTab: function(tab) {
            localStorage["user:tab"] = tab;
        },

        files: function() {
            this.groove.addFilesToQueue(this.data.files);
        },

        muted: function(muted) {
            // set the volume for the local stream
            this.groove.setVolume(muted ? 0 : 1);
            // set the volume for the remote stream
            this.player.muted = muted;
        },

        'chat_messages.length': function() {
            var el = this.nodes.messages;
            function scrollToBottom() {
                el.scrollTop = el.scrollHeight;
            }
            var lastElHeight = el.lastElementChild.offsetHeight;
            var isScrolledToBottom = (el.scrollHeight - el.scrollTop -
                el.clientHeight - lastElHeight) < lastElHeight;
            if (isScrolledToBottom) {
                scrollToBottom();
            }
        }
    },

    eventHandlers: {
        teardown: function() {
            this.groove.leaveRoom();
            this.appObservers.cancel();
            clearTimeout(this.pickInterval);
            this.groove.releaseGroup(this);
        },

        switchTab: function(e, tab) {
            if (tab == 'chat' && this.data.newMessages) {
                this.set('newMessages', false);
            }
            this.set('currentTab', tab);
        },

        clickUser: function(e) {
            var user = e.context;
            if (user == this.groove.me) {
                this.app.setOverlay('settings');
            } else {
                // TODO: Maybe have this open a private chat?
            }
        },

        newMessage: function() {
            var text = this.get('message_text');
            var last = this.groove.lastChatAuthor;
            var me = this.groove.me;

            if (text && text.trim()) {
                this.data.chat_messages.push({
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
            var track = this.get('tracks')[i];
            console.log('delete track', track, i);
            this.groove.deleteTrack(this.groove.activePlaylist, track);
        },

        bumpTrack: function(e) {
            var i = e.index.i;
            var track = this.data.tracks[i];
            if (!track) {
                console.error('Unknown track');
                return;
            }
            track.playlistPosition = -1;
            this.updatePlaylistPositions();
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
        }
    },

    events: {
        dragend: function(node, fire) {
            function shoot(e) {
                fire({
                    node: node,
                    original: e
                });
            }
            node.addEventListener('dragleave', shoot, false);
            node.addEventListener('drop', shoot, false);
            return {
                teardown: function() {
                    node.removeEventListener('dragleave', shoot, false);
                    node.removeEventListener('drop', shoot, false);
                }
            };
        },

        dropfiles: function(node, fire) {
            function resolve(e, files) {
                fire({
                    node: node,
                    original: e,
                    files: files
                });
            }

            function preventDefault(e) {
                e.preventDefault();
            }

            function drop(e) {
                e.preventDefault();
                resolve(e, e.dataTransfer.files);
            }

            function click() {
                var input = document.createElement('input');
                input.type = 'file';
                function onChange(e) {
                    resolve(e, input.files);
                    input.removeEventListener('change', onChange);
                }
                input.addEventListener('change', onChange, false);
                input.click();
            }

            node.addEventListener('dragenter', preventDefault, false);
            node.addEventListener('dragleave', preventDefault, false);
            node.addEventListener('dragover', preventDefault, false);
            node.addEventListener('drop', drop, false);
            node.addEventListener('click', click, false);

            return {
                teardown: function() {
                    node.removeEventListener('dragenter', preventDefault,false);
                    node.removeEventListener('dragleave', preventDefault,false);
                    node.removeEventListener('dragover', preventDefault, false);
                    node.removeEventListener('drop', drop, false);
                    node.removeEventListener('click', click, false);
                }
            };
        }
    },

    grooveEventHandlers: {
        chat: function(message) {
            if (this.data.currentTab != 'chat') {
                this.set('newMessages', true);
            }

            if (message.text.indexOf(this.groove.me.name) != -1) {
                this.playSoundEffect('ping');
            }

            var last = this.groove.lastChatAuthor;
            message.isContinuation = (last && last == message.from);
            this.groove.lastChatAuthor = message.from;
            this.data.chat_messages.push(message);
            this.pruneChat();
        },

        peerConnected: function(user) {
            this.data.users.push(user);
            this.watchUser(user);
        },

        peerDisconnected: function(user) {
            var i = this.data.users.indexOf(user);
            if (i == -1) return;
            this.data.users.splice(i, 1);
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

        queueUpdate: function() {
            this.update('tracks');
        },

        setVote: function() {
            this.updateVotes();
            this.update('users');
        },

        playlistUpdated: function(playlistName) {
            this.set('tracks', this.groove.playlists[playlistName]);
        },

        djs: function() {
            this.set('djs', this.groove.djs);
        },

        activeDJ: function() {
            this.set('activeDJ', this.groove.activeDJ);
        },

        activeTrack: function() {
            this.set('currentTrack', this.groove.activeTrack);
        },

        activeTrackURL: function() {
            var track = this.groove.activeTrack;
            var url = track && track.url;
            if (url) {
                console.log('got track url', url.length, url.substr(0, 256));
                this.player.src = url;
                this.player.play();
            } else {
                this.player.pause();
            }
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
        user.on('name', this.updateUsers);
        user.on('vote', this.updateUsers);
        user.on('gravatar', this.updateUsers);
    },

    pruneChat: function() {
        var msgs = this.data.chat_messages;
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

    updatePlaylistPositions: function() {
        this.data.tracks.sort(function(a, b) {
            return a.playlistPosition|0 - b.playlistPosition|0;
        });
        this.data.tracks.forEach(function(track, i) {
            track.playlistPosition = i;
        });
        this.groove.savePlaylist(this.groove.activePlaylist);
    }
});
