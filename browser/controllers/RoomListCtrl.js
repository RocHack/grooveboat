/*
* Room selection
*/
var Ractive = require('ractive/ractive.runtime');
module.exports = Ractive.extend({
    template: require("../templates/room_list.html"),

    data: {
        room_selected: -1,
        new_room_name: '',
        creating_room: false,
        username: 'Guest',
        rooms: []
    },

    onconstruct: function(options) {
        this.groove = options.groove;
        this.router = options._router;

        this.on(this.eventHandlers);
        this.updateRooms = this.update.bind(this, 'rooms');
        this.groove.on('roomsChanged', this.updateRooms);
    },

    onrender: function() {
        this.set('username', this.groove.me.name);
        this.set('rooms', this.groove.rooms);
    },

    onteardown: function() {
        this.groove.me.setName(this.data.username);
        this.groove.off('roomsChanged', this.updateRooms);
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
