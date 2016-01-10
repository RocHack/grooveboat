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
            username: 'Guest',
            rooms: []
        };
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
        this.groove.me.setName(this.get('username'));
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
