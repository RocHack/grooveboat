var Ractive = require('ractive/build/ractive.runtime');
require('../lib/ractive-events-keys');
var emoji = require('emoji-images');

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
noDjMessages.sort(Math.random);

// periodically shuffle the no-DJ messages
setInterval(noDjMessages.sort.bind(noDjMessages, Math.random), 30 * 1000);
//if($scope.currentTrack) return;


function isAudience(user) {
    return !user.dj;
}

module.exports = Ractive.extend({
    template: require("../templates/room.html"),

    data: {
        currentTab: null,
        currentTrack: null,
        votes: {yes: 0, no: 0},
        newMessages: false,

        messageToHTML: function(text) {
            var myName = this.groove.me.name;
            return emoji(text, 'static/img/emoji').
                replace(myName, "<span class=\"mention\">"+ myName +"</span>");
            // TODO: linky
        }
    },

    computed: {
        audience: function() {
            return this.get('users').filter(isAudience);
        },

        joinText: function() {
            var isDJ = this.groove && this.groove.me.dj;
            return isDJ ? 'step down' : 'become a dj';
        }
    },

    soundEffects: {
        "ping": new Audio("static/ping.wav")
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

        this.player = document.createElement('audio');
        window.player = this.player;  // for debugging

        this.on(this.eventHandlers);
        this.observe(this.observers);

        this.appObservers = this.app.observe({
            muted: this.onMuted.bind(this)
        });

        /*
        * Listeners from the buoy server
        */
        this.groove.on('chat', function(message) {
            console.log('chat', message);
            if (this.currentTab != 'chat') {
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
        });
    },

    observers: {
        currentTab: function(tab) {
            localStorage["user:tab"] = tab;
        }
    },

    eventHandlers: {
        teardown: function() {
            this.groove.leaveRoom();
            this.appObservers.cancel();
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

        newMessage: function(e) {
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

        deleteTrack: function(e) {
            var track = this.get('tracks')[e.index];
            console.log('delete track', track, e.index);
            this.groove.deleteTrack(this.groove.activePlaylist, track);
        },

        bumpTrack: function(e) {
            var i = e.index;
            if (i == null || i < 0) return;
            var track = this.data.tracks[i];
            this.data.tracks.splice(i, 1);
            this.data.tracks.unshift(track);

            this.groove.savePlaylist(this.groove.activePlaylist);
        },

        vote: function(e, direction) {
            if (this.groove.activeDJ == this.groove.me) {
                return;
            }

            this.groove.vote(direction);
        }
    },

    onMuted: function(muted) {
        // set the volume for the local stream
        this.groove.setVolume(muted ? 0 : 1);
        // set the volume for the remote stream
        this.player.muted = muted;
    },

    pruneChat: function() {
        var count = this.data.chat_messages.length;
        if (count > 76) {
            this.data.chat_messages.splice(0, count - 75);
        }
    },

    playSoundEffect: function(sound) {
        var a = this.soundEffects[sound];
        a.pause();
        a.currentTime = 0;
        a.play();
    }
});

    /*
    $scope.sortableOptions = {
        stop: function(e, ui) {
            $scope.tracks.forEach(function(track, i) {
                track.playlistPosition = i;
            });
            groove.savePlaylist(groove.activePlaylist);
        },
        axis: "y"
    };
    */

/*
ng-init="msgPlaceholder = 'send a message'; iMsgPlaceholder = msgPlaceholder;"
on-focus=""
ui-event="{focus: 'msgPlaceholder = null', blur: 'msgPlaceholder = iMsgPlaceholder'}"
*/

if (0) {

    $scope.dragEnter = function() {
        $scope.currentlyDragging = true;
    }

    $scope.dragLeave = function() {
        $scope.currentlyDragging = false;
    }

    $scope.isDJ = function(user) {
        return (user.dj == true);
    }

    var digest = $scope.$digest.bind($scope);
    function watchUser(user) {
        user.on("name", digest);
        user.on("vote", digest);
        user.on("gravatar", digest);
    }

    $scope.$watch("files", function() {
        groove.addFilesToQueue($scope.files);
    });

    groove.on("setVote", function(user) {
        if($scope.$$phase) {
            $scope.votes = groove.getVotes();
        } else {
            $scope.$apply(function() {
                $scope.votes = groove.getVotes();
            });
        }
    });

    groove.on("playlistUpdated", function(playlistName) {
        $scope.$apply(function($scope) {
            $scope.tracks = groove.playlists[playlistName];
        });
    });

    groove.on("djs", function(djs) {
        $scope.$apply(function($scope) {
            $scope.djs = groove.djs;
        });
    });

    groove.on("activeDJ", function() {
        if($scope.$$phase) {
            $scope.activeDJ = groove.activeDJ;
        } else {
            $scope.$apply(function($scope) {
                $scope.activeDJ = groove.activeDJ;
            });
        }
    });

    groove.on("activeTrack", function() {
        if($scope.$$phase) {
            $scope.currentTrack = groove.activeTrack;
        } else {
            $scope.$apply(function($scope) {
                $scope.currentTrack = groove.activeTrack;
            });
        }
    });

    groove.on("activeTrackURL", function() {
        var track = groove.activeTrack;
        var url = track && track.url;
        if (url) {
            console.log("got track url", url.length, url.substr(0, 256));
            player.src = url;
            player.play();
        } else {
            player.pause();
        }
    });

    groove.on("activeTrackDuration", function() {
        // console.log("Duration!", groove.activeTrack.duration);
    });

    groove.on("currentTrackTime", function() {
        // console.log("Current time!", groove.getCurrentTrackTime());
    });

    groove.on("emptyPlaylist", function() {
        alert("Add some music to your playlist first.");
    });

    groove.on("queueUpdate", digest);

    groove.on("peerConnected", function(user) {
        $scope.$apply(function($scope) {
            $scope.users.push(user);
            watchUser(user);
        });
    });

    groove.on("peerDisconnected", function(user) {
        $scope.$apply(function($scope) {
            var i =  $scope.users.indexOf(user);
            if(i == -1) {
                return;
            }

            $scope.users.splice(i, 1);
        });
    });

    groove.buoy.on("reconnected", function() {
        $scope.$apply(function($scope) {
            $scope.users = [groove.me];
            $scope.djs = [];
            groove.me.setName(groove.me.name);
            groove.me.setGravatar(groove.me.gravatar);
            groove.joinRoom($routeParams.room);
        });
    });
}
