/*
* Room selection
*/
var Ractive = require('ractive/build/ractive.runtime');
module.exports = Ractive.extend({
    template: require("../templates/room_list.html"),

    data: {
        room_selected: -1,
        creating_room: false,
        rooms: []
    },

    init: function () {
        this.on({
            joinRoom: this.joinRoom.bind(this)
        });
        this.observe("username", function (name) {
            // tell Groove to set name
            console.log("name:", name);
            //localStorage["user:name"] = groove.me.name;
            //currentUser.name
        });
        //groove.on("roomsChanged", this.update.bind(this));
    },

    joinRoom: function() {
        var room;
        if(this.room_selected == this.rooms.length) {
            room = this.new_room_name;
        } else {
            room = this.rooms[this.room_selected];
        }
        var roomId = room.replace(/\s/g, "-");
        var title = room + " | grooveboat";
        //groove.me.updateIconURL(room);
        window.history.pushState({}, title, "/room/" + roomId);
    }
});

    /*
    $scope.rooms = groove.rooms;

    $scope.joinRoom = function() {
    }

    /*
     * Listeners
     */
    // Listen for any new rooms being created or removed
