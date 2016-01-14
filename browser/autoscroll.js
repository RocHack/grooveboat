// Auto-scroll
// Maintains scroll position in a list
module.exports = function sortable(el, keypath) {
    function scrollToBottom() {
        el.scrollTop = el.scrollHeight;
    }

    var observer = this.observe(keypath + '.length', function() {
        var lastEl = el.lastElementChild;
        if (!lastEl) return;
        var lastElHeight = lastEl.offsetHeight
        var isScrolledToBottom = (el.scrollHeight - el.scrollTop -
            el.clientHeight - lastElHeight) < lastElHeight;
        if (isScrolledToBottom) {
            scrollToBottom();
        }
    });

    return {
        teardown: function() {
            observer.cancel();
        }
    };
};
