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

    decorators: {
        autoscroll: require('../autoscroll')
    },

    data: function () {
        return {
            collapsed: false,
            messageToHTML: messageToHTML
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

        this.set({
            peer: this.peer,
            messages: [],
            messageToHTML: messageToHTML
        });

        this.on(this.eventHandlers);
        this.observe(this.observers);
        this.peerEventHandlers = this.bind(this.peerEventHandlers);
        for (var name in this.peerEventHandlers) {
            this.peer.on(name, this, this.peerEventHandlers[name]);
        }

        this.focus();
    },

    onteardown: function() {
        this.peer.releaseGroup(this);
    },

    observers: {
        collapsed: function() {
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

        newMessage: function(e) {
            e.original.preventDefault();
            var text = this.get('message_text');
            if (text && text.trim()) {
                this.send(text);
            }
            this.set('message_text', '');
        },

        newMessageFocus: function() {
            this.set('newMessageFocused', true);
        },

        newMessageBlur: function() {
            this.set('newMessageFocused', false);
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

    send: function(text) {
        if (!text) return;
        this.peer.sendChat(text);
        this.addMessage(text, this.me);
    },

    focus: function () {
        this.nodes.newMessage.focus();
        this.set('collapsed', false);
    },

    messageToHTML: messageToHTML
};
