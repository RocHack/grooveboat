var emoji = require('emoji-images');
var linkify = require('html-linkify');

function messageToHTML(text) {
    // sanitize html
    text = linkify(text);
    // render emoji
    text = emoji(text, '/static/img/emoji');
    // highlight mentions
    var myName = this.groove.me.name;
    return text.replace(myName,
        '<span class="mention">' + myName + '</span>');
}

module.exports = {
    template: require('../templates/private_chat.html'),
    events: require('../events'),

    data: {
        collapsed: false,
        messageToHTML: messageToHTML
    },

    computed: {
        msgPlaceholder: function() {
            return this.get('newMessageFocused') ? '' : 'send a message';
        }
    },

    bind: function(handlers) {
        var bound = {};
        for (var name in handlers) {
            bound[name] = handlers[name].bind(this);
        }
        return bound;
    },

    init: function(options) {
        this.peer = options.peer;
        this.me = options.me;

        this.set({
            peer: this.peer,
            messages: [],
            messageToHTML: messageToHTML
        });

        this.on(this.eventHandlers);
        this.observe(this.observers);
        this.channelEventHandlers = this.bind(this.channelEventHandlers);
        this.peerEventHandlers = this.bind(this.peerEventHandlers);
        for (var name in this.peerEventHandlers) {
            this.peer.on(name, this, this.peerEventHandlers[name]);
        }

        this.focus();
    },

    observers: {
        channel: function(chan, prevChan) {
            this.channel = chan;
            this.set('status', {
                open: 'connected',
                closed: 'disconnected'
            }[chan.readyState]);
            for (var name in this.channelEventHandlers) {
                var fn = this.channelEventHandlers[name];
                if (chan) chan.addEventListener(name, fn, false);
                if (prevChan) prevChan.removeEventListener(name, fn, false);
            }
        },

        collapsed: function() {
            this.set('newMessages', false);
        }
    },

    eventHandlers: {
        teardown: function() {
            this.peer.releaseGroup(this);
            this.channel.close();
            this.set('channel', null);
        },

        toggleCollapse: function(e) {
            e.original.preventDefault();
            this.toggle('collapsed');
        },

        closeChat: function(e) {
            e.original.preventDefault();
            this.teardown();
        },

        newMessage: function(e) {
            e.original.preventDefault();
            this.send(this.get('message_text'), function(err) {
                if (err) {
                    this.addMessage('unable to send message', null, 'status');
                } else {
                    this.set('message_text', '');
                }
            });
        },

        newMessageFocus: function() {
            this.set('newMessageFocused', true);
        },

        newMessageBlur: function() {
            this.set('newMessageFocused', false);
        }
    },

    channelEventHandlers: {
        message: function(e) {
            this.addMessage(e.data, this.peer);
            this.set('newMessages', true);
        },

        open: function() {
            this.set('status', 'connected');
        },

        close: function() {
            this.set('status', 'disconnected');
        },

        error: function(e) {
            console.error(e);
            this.addMessage(e.toString(), null, 'error');
        }
    },

    peerEventHandlers: {
        disconnected: function() {
            this.addMessage(this.peer.name + " left", null, 'status');
            this.set('status', 'disconnected');
        },

        name: function() {
            this.update();
        }
    },

    addMessage: function(text, from, type) {
        this.get('messages').push({
            from: this.last == from ? null : from,
            type: type,
            text: text
        });
        this.last = from;
    },

    send: function(text, cb, immediate) {
        if (!text) return;
        try {
            this.channel.send(text);
        } catch(e) {
            if (immediate) {
                return cb.call(this, e);
            }
            // remote closed connection
            this.set('status', 'disconnected');
            // try to reconnect
            this.peer.startChat();
            // resend message
            var onStatus = this.observe('status', function(status) {
                if (status == 'connected') {
                    this.send(text, cb, true);
                    onStatus.cancel();
                } else if (status == 'disconnected') {
                    cb.call(this, e);
                    onStatus.cancel();
                }
            });
            return;
        }
        this.addMessage(text, this.me);
        cb.call(this);
    },

    focus: function () {
        this.nodes.newMessage.focus();
        this.set('collapsed', false);
    },

    messageToHTML: messageToHTML
};
