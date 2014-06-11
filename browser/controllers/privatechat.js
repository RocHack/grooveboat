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

	init: function(options) {
		this.peer = options.user;
		this.me = options.me;
		this.channel = options.channel;

		this.set({
			peer: this.peer,
			messages: [],
			messageToHTML: messageToHTML
		});

		this.on(this.eventHandlers);

		for (var eventType in this.channelEventHandlers) {
			var handler = this.channelEventHandlers[eventType].bind(this);
			this.channel.addEventListener(eventType, handler, false);
		}

		this.focus();
	},

	eventHandlers: {
		teardown: function() {
			console.log('teardown');
		},

		collapseChat: function(e) {
			e.original.preventDefault();
			this.toggle('collapsed');
		},

		closeChat: function(e) {
			console.log('close');
			e.original.preventDefault();
			this.channel.close();
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

	channelEventHandlers: {
		message: function(e) {
			// use empty message to mean closing channel
			if (e.data === "") {
				this.teardown();
			}
			this.get('messages').push({
				from: this.last == this.peer ? null : this.peer,
				text: e.data
			});
			this.last = this.peer;
		},

		close: function() {
			this.teardown();
		},

		error: function(e) {
			this.showError(e);
		}
	},

	send: function(text) {
		this.get('messages').push({
			from: this.last == this.me ? null : this.me,
			text: text
		});
		this.last = this.me;
		try {
			this.channel.send(text);
		} catch(e) {
			this.showError(e);
		}
	},

	focus: function () {
		this.nodes.newMessage.focus();
		this.set('collapsed', false);
	},

	showError: function(err) {
		this.get('messages').push({
			text: err.toString()
		});
	},

	messageToHTML: messageToHTML
};
