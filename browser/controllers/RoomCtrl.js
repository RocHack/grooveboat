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
        this.storage = options.storage;
        this.groove.joinRoom(this.room);

        this.set({
            djs: [],
            files: [],
            users: [this.groove.me],
            me: this.groove.me,
            chat_messages: [],
            currentTab: this.storage.get('user:tab') || 'music',
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
            this.storage.set("user:tab", tab);
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
        },

        tracks: function() {
            var tracks = this.get('tracks');
            //console.log('tracks!', tracks.map(title), tracks._dragging);
            if (tracks._dragging) {
                tracks._dragging = false;
                this.groove.setPlaylist(this.groove.activePlaylist, tracks);
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

        newMessage: function(e) {
            e.original.preventDefault();

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
            var tracks = this.get('tracks');
            var track = tracks[i];
            // get around keypath error
            this.set('tracks', null);
            this.groove.deleteTrack(this.groove.activePlaylist, track);
            this.set('tracks', tracks);
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

    decorators: {
        sortable: function(listEl, keypath) {
            var el;
            var startY;
            var startIndex, currentIndex;
            var origNextNode;
            var ractive = this;

            // find the element ancestor corresponding to an item in our list
            function findEl(child) {
                for (var el = child;
                    el && el.parentNode != listEl;
                    el = el.parentNode);
                return el;
            }

            function onDrag(e) {
                var height = el.clientHeight;

                // swap item down the list
                while (e.clientY - startY > height && el.nextElementSibling) {
                    startY += height;
                    currentIndex++;
                    var nextEl = el.nextElementSibling;
                    if (nextEl.nextElementSibling) {
                        listEl.insertBefore(el, nextEl.nextElementSibling);
                    } else {
                        listEl.appendChild(el);
                    }
                }

                // swap item up the list
                while (e.clientY - startY < -height &&
                        el.previousElementSibling) {
                    currentIndex--;
                    startY -= height;
                    listEl.insertBefore(el, el.previousElementSibling);
                }
                el.style.top = (e.clientY - startY) + 'px';
            }

            function onDragEnd(e) {
                document.removeEventListener('mousemove', onDrag, false);
                document.removeEventListener('mouseup', onDragEnd, false);
                onDrag(e);

                var itemEl = el;
                el.classList.remove('ui-sortable-helper');
                el.style.position = '';
                el.style.top = '';
                el.style.zIndex = '';
                listEl.style.overflow = '';
                el = null;

                if (currentIndex == startIndex) {
                    // node did not move
                    return;
                }

                // put element back in place
                if (origNextNode) {
                    listEl.insertBefore(itemEl, origNextNode);
                } else {
                    listEl.appendChild(itemEl);
                }

                // update model
                var arrayOrig = ractive.get(keypath);
                var array = arrayOrig.slice();
                var item = array[startIndex];
                item.playlistPosition = currentIndex;
                // remove item from old position
                array.splice(startIndex, 1);
                // add item to array at new position
                array.splice(currentIndex, 0, item);

                array._dragging = true;
                //ractive.merge(keypath, array);
                /*
                arrayOrig.sort(function(a, b) {
                    return array.indexOf(a) - array.indexOf(b);
                });
                */
                ractive.set(keypath, array);

                array._dragging = false;
            }

            function onMouseDown(e) {
                e.preventDefault();

                if (el) {
                    // finish previous drag
                    onDragEnd(e);
                    return;
                }

                el = findEl(e.target);
                if (!el) {
                    console.error('Unable to find list item');
                    return;
                }

                el.classList.add('ui-sortable-helper');
                el.style.position = 'relative';
                el.style.zIndex = 10000;
                listEl.style.overflow = 'visible';
                origNextNode = el.nextElementSibling;
                startY = e.clientY;
                var elKeypath = el._ractive.keypath;
                var lastDot = elKeypath.lastIndexOf('.') + 1;
                currentIndex = startIndex = +elKeypath.substr(lastDot);

                document.addEventListener('mousemove', onDrag, false);
                document.addEventListener('mouseup', onDragEnd, false);
            }

            listEl.addEventListener('mousedown', onMouseDown, false);

            return {
                teardown: function() {
                    listEl.removeEventListener('mousedown', onMouseDown, false);
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
