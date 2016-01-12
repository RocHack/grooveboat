var emoji = require('emoji-images');
var SuggestBox = require('../suggest-box');
var emojiUtils = require('../emojiutils');

module.exports = {
    template: require('../templates/private_chat.html'),
    events: require('../events'),

    decorators: {
        autoscroll: require('../autoscroll')
    },

    data: function () {
        return {
            peer: this.peer,
            collapsed: false,
            messages: [],
            messageToHTML: emojiUtils.messageToHTML.bind(this)
        };
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

    onconstruct: function(options) {
        this.peer = options.peer;
        this.me = options.me;
        this.app = options.app;

        this.on(this.eventHandlers);
        this.channelEventHandlers = this.bind(this.channelEventHandlers);
        this.peerEventHandlers = this.bind(this.peerEventHandlers);
        for (var name in this.peerEventHandlers)
            this.peer.on(name, this, this.peerEventHandlers[name]);
    },

    onteardown: function() {
        this.peer.releaseGroup(this);
        this.channel.close();
        this.set('channel', null);
    },

    onrender: function () {
        this.observer = this.observe(this.observers);
        this.nodes.newMessage.addEventListener('enter',
            this.sendMessage.bind(this), false);

        this.suggestbox = new SuggestBox({
            input: this.nodes.newMessage,
            el: document.createElement('div'),
            submitEvent: 'enter',
            choices: {
                ':': emojiUtils.getSuggests
            }
        });
    },

    onunrender: function() {
        this.observer.cancel();
        this.suggestbox.teardown();
    },

    observers: {
        channel: function(chan, prevChan) {
            this.channel = chan;
            this.set('status', chan && chan.readyState == 'open'
                ? 'connected'
                : 'disconnected');
            for (var name in this.channelEventHandlers) {
                var fn = this.channelEventHandlers[name];
                if (chan) chan.addEventListener(name, fn, false);
                if (prevChan) prevChan.removeEventListener(name, fn, false);
            }
        },

        collapsed: function(collapsed) {
            if (!collapsed)
                this.set('newMessages', false);
        }
    },

    eventHandlers: {
        toggleCollapse: function(e) {
            e.original.preventDefault();
            this.toggle('collapsed');
        },

        closeChat: function(e) {
            e.original.preventDefault();
            this.teardown();
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
            this.app.playSoundEffect('ping');
            this.app.backgroundNotify({
                title: this.peer.name,
                icon: this.peer.iconURL,
                body: e.data
            });
            this.addMessage(e.data, this.peer);
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
        if (this.get('collapsed'))
            this.set('newMessages', true);
    },

    sendMessage: function(e) {
        this.updateModel();
        this.send(this.get('message_text'), function(err) {
            if (err) {
                this.addMessage('unable to send message', null, 'status');
            } else {
                this.set('message_text', '');
            }
        });
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
    }
};
