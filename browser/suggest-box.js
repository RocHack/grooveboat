// Suggest Box
// Allows a textarea to have suggest menu popups
// based on [suggest-box](https://github.com/pfraze/suggest-box) by Paul Frazee (MIT Licensed)

var Ractive = require("ractive/ractive.runtime");
var TextareaCaretPosition = require("textarea-caret-position")

var wordBoundary = /\s/;

function compare(a, b) {
    return compareval(a.rank, b.rank) || compareval(a.title, b.title)
}

function compareval(a, b) {
    return a === b ? 0 : a < b ? -1 : 1
}

module.exports = Ractive.extend({
    template: require("./templates/suggestbox.html"),

    data: function () {
        return {
            options: [],
            selection: 0,
        };
    },

    onconstruct: function (opt) {
        this.input = opt.input;
        this.choices = opt.choices;
        this.submitEvent = opt.submitEvent || "enter";

        this.input.addEventListener("input",
            this.oninput = this.oninput.bind(this), false);
        this.input.addEventListener("keydown",
            this.onkeydown = this.onkeydown.bind(this), false);
        this.input.addEventListener("blur",
            this.onblur = this.onblur.bind(this), false);

        this.on(this.eventHandlers);
    },

    onteardown: function () {
        this.input.removeEventListener("input", this.oninput, false);
        this.input.removeEventListener("keydown", this.onkeydown, false);
        this.input.removeEventListener("blur", this.onblur, false);
    },

    activate: function () {
        if (this.active)
            return;
        this.active = true;
        document.body.appendChild(this.el);
    },

    deactivate: function () {
        if (!this.active)
            return;
        this.active = false;
        this.el.parentNode.removeChild(this.el);
    },

    computed: {
        choice: function () {
            return this.get("options." + this.get("selection"));
        }
    },

    eventHandlers: {
        optionMouseDown: function(e) {
            this.set("selection", e.keypath.match(/[0-9]*$/)[0]);
            this.addChoice();
            setTimeout(function () {
                this.input.focus();
            }.bind(this), 50);
        },
    },

    oninput: function (e) {
        var choices
        var self = this

        // are we in a word that starts with one of the starting characters?
        var isany = false
        var v = e.target.value
        var i = e.target.selectionStart - 1
        // seek backwards from the cursor
        for (i; i >= 0; i--) {
            var c = v.charAt(i)
            // hit a word boundary?
            if (wordBoundary.test(c))
                return this.deactivate()
            // hit a starting character?
            if ((c in this.choices || this.choices.any) && (i === 0 || wordBoundary.test(v.charAt(i - 1)))) {
                choices = this.choices[c] || this.choices.any
                if (choices == this.choices.any)
                    isany = true
                break
            }
        }
        // no hit?
        if (i < 0)
            return this.deactivate()

        // extract current word
        var word = v.slice(i+(isany?0:1), e.target.selectionStart)
        if (!word)
            return this.deactivate()

        // filter and order the list by the current word
        this.set('selection', 0);

        //request data for this query.

        if ('function' === typeof choices) {
            // synchronous is easier. can memoize
            choices = choices();
        }
        if (Array.isArray(choices)) {
            var wordRe = new RegExp(word.replace(/\W/g, ''), 'i')
            this.filtered = choices.map(function (opt, i) {
                var title = wordRe.exec(opt.title)
                var subtitle = opt.subtitle ? wordRe.exec(opt.subtitle) : null
                var rank = (title === null ? (subtitle&&subtitle.index) : (subtitle === null ? (title&&title.index) : Math.min(title.index, subtitle.index)))
                if (rank !== null) {
                    opt.rank = rank
                    return opt
                }
            }).filter(Boolean).sort(compare).slice(0, 20)
            next()
        } else if ('function' === typeof choices) {
            var r = this.request = (this.request || 0) + 1
            choices(word, function (err, ary) {
                //if there has been another request since this was made
                //but they came back in another order, just drop this one.
                if (r != self.request) return;
                if (err) console.error(err);
                else self.filtered = ary
                next()
            })
        }

        function next() {
            // cancel if there's nothing available
            if (self.filtered.length == 0)
                return self.deactivate();

            // create / update the element
            if (!self.active) {
                // calculate position
                var pos = new TextareaCaretPosition(e.target)
                    .get(e.target.selectionStart, e.target.selectionEnd);

                var bounds = e.target.getBoundingClientRect();

                // setup
                self.set({
                    left: pos.left + bounds.left - e.target.scrollLeft,
                    bottom: pos.top + bounds.top - e.target.scrollTop - self.input.parentNode.scrollHeight + 40
                });
                self.activate();
            }
            self.set('options', self.filtered);
        }
    },

    onkeydown: function (e) {
        if (this.active) {
            var sel = this.get("selection")

            if (e.keyCode == 38 || e.keyCode == 40 || e.keyCode == 13 || e.keyCode == 9|| e.keyCode == 27)
                e.preventDefault()

            // up
            if (e.keyCode == 38 && sel > 0) {
                this.set("selection", sel - 1);
            }

            // down
            if (e.keyCode == 40 && sel < (this.filtered.length - 1)) {
                this.set("selection", sel + 1);
            }

            // escape
            if (e.keyCode == 27) {
                this.deactivate()
            }

            // enter or tab
            if (e.keyCode == 13 || e.keyCode == 9) {
                this.addChoice();
            }
        } else if (e.keyCode == 13) {
            // enter
            e.preventDefault();
            this.input.dispatchEvent(new CustomEvent(this.submitEvent));
        }
    },

    onblur: function (e) {
        this.deactivate(this);
    },

    addChoice: function () {
        // update the text under the cursor to have the current selection's value
        var choice = this.get("choice");
        if (!choice || !choice.value)
            return;
        var v = this.input.value;
        var start = this.input.selectionStart;
        var end = start;
        for (start; start >= 0; start--) {
            if (v.charAt(start) in this.choices)
                break;
        }
        for (end; end < v.length; end++) {
            if (wordBoundary.test(v.charAt(end)))
                break;
        }
        this.input.value = v.slice(0, start + 1) + choice.value + v.slice(end)
        this.input.selectionStart = this.input.selectionEnd = start + choice.value.length + 1
        this.deactivate();
    }
});
