/*
* Room selection
*/
var Ractive = require('ractive/build/ractive.runtime');
module.exports = Ractive.extend({
    template: require("../templates/room_list.html"),

    data: {
        room_selected: -1,
        new_room_name: '',
        creating_room: false,
        username: 'Guest',
        rooms: []
    },

    init: function(options) {
        this.groove = options.groove;
        this.router = options.router;

        this.on(this.eventHandlers);
        this.observe('username', function (name) {
            console.log('name:', name);
            //this.groove.me.setName(name):
            //localStorage["user:name"] = groove.me.name;
            //currentUser.name
        });
        this.groove.on('roomsChanged', this.update.bind(this, 'rooms'));
    },

    eventHandlers: {
        joinRoom: function() {
            var room;
            if (this.data.room_selected == 'new') {
                room = this.data.new_room_name;
            } else {
                room = this.data.rooms[this.data.room_selected];
            }
            var roomId = room.replace(/\s/g, "-");
            this.router.navigate("/room/" + roomId);
            //var title = room + " | grooveboat";
        },

        selectRoom: function(e, i) {
            this.set('room_selected', i);
        }
    }
});

/*
* Listeners
*/
// Listen for any new rooms being created or removed
