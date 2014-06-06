/*
require('jquery-ui/sortable');
require('angular-sanitize/angular-sanitize');
require('angular-local-storage/angular-local-storage');
require('angular-ui-sortable/src/sortable');
require('angular-ui-utils/modules/event/event');
require('angular-ui-utils/modules/keypress/keypress');
*/

var Ractive = require('ractive/build/ractive.runtime');
var Router = Ractive.extend(require('./router'));

var MainCtrl = require('./controllers/MainCtrl');
var RoomListCtrl = require('./controllers/RoomListCtrl');
var RoomCtrl = require('./controllers/RoomCtrl');

// Set up storage

var storage = {
    prefix: 'ls.',
    set: function(key, value) {
        localStorage[this.prefix + key] = value;
    },
    get: function(key) {
        return localStorage[this.prefix + key];
    }
};

// Set up Groove

var Groove = require('./groove');

var groove = new Groove();
window.groove = groove;

groove.connectToBuoy("ws://" + location.hostname + ":8844");

var name = storage.get("user:name");
var gravatar = storage.get("user:gravatar");
if (!name) {
    name = "Guest " + Math.floor(Math.random()*101);
    storage.set("user:name", name);
}
if(gravatar) {
    groove.me.setGravatar(gravatar);
}
groove.me.setName(name);

// Set up UI

var main = new MainCtrl({
    groove: groove,
    storage: storage
});

document.addEventListener('DOMContentLoaded', function() {
    main.insert(document.body);
}, false);

// Set up routing

var router = new Router({
    el: main.nodes.content
});
router.setHandler(function(path) {
    if (path == '/') {
        return new RoomListCtrl({
            app: main,
            groove: groove,
            router: router,
            storage: storage
        });
    } else if (path.indexOf('/room/') === 0) {
        var room = path.substr(6);
        return new RoomCtrl({
            app: main,
            groove: groove,
            router: router,
            room: room,
            storage: storage
        });
    }
});
