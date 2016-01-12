var emoji = require('emoji-images');
var linkify = require('html-linkify');

var emojiSuggestList;

function emojiToSuggestion(em) {
	em = em.replace(/:/g, '');
	return {
		image: '/static/img/emoji/' + em + '.png',
		title: em,
		subtitle: em,
		value: em + ':'
	};
}

module.exports.getSuggests = function () {
    return emojiSuggestList || (emojiSuggestList =
		emoji.list.map(emojiToSuggestion));
}

module.exports.messageToHTML = function (text) {
    // sanitize html
    text = linkify(text);
    // render emoji
    text = emoji(text, '/static/img/emoji');
    // highlight mentions
    var myName = this.me.name;
    return text.replace(myName,
        '<span class="mention">' + myName + '</span>');
};
