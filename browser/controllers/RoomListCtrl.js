/*
* Room selection
*/
var Ractive = require('ractive/ractive.runtime');
module.exports = Ractive.extend({
    template: require("../templates/room_list.html"),

    data: function () {
        return {
            room_selected: -1,
            new_room_name: '',
            creating_room: false,
            username: this.groove.me.name,
            rooms: this.groove.rooms
        };
    },

    onconstruct: function(options) {
        this.groove = options.groove;
        this.router = options._router;
        this.storage = options.storage;

        this.on(this.eventHandlers);
        this.updateRooms = this.update.bind(this, 'rooms');
        this.groove.on('roomsChanged', this.updateRooms);
    },

    onteardown: function() {
        var username = this.get('username');
        this.groove.me.setName(username);
        this.storage.set('user:name', username);
        this.groove.off('roomsChanged', this.updateRooms);
    },

    eventHandlers: {
        joinRoom: function() {
            var room;
            var roomSel = this.get('room_selected');
            if (roomSel == 'new') {
                room = this.get('new_room_name');
            } else {
                room = this.get('rooms')[roomSel];
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
