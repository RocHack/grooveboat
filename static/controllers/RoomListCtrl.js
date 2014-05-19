function RoomListCtrl($scope, $location, groove, localStorageService) {
    /*
     * Room selection
     */
    $scope.room_selected = -1;
    $scope.creating_room = false;
    $scope.new_room_name = "";
    $scope.rooms = [];

    $scope.clickRoom = function(i) {
        $scope.room_selected = i;
    }

    $scope.clickJoinRoom = function() {
        var room;
        if($scope.room_selected == $scope.rooms.length) {
            room = $scope.new_room_name;
        } else {
            room = $scope.rooms[$scope.room_selected];
        }
        room = room.replace(/\s/g, "-");
        groove.me.updateIconURL(room);
        localStorageService.set("user:name", groove.me.name);
        $location.path("/room/" + room);
    }

    /*
     * Buoy listeners
     */
    // Wait to get a welcome message
    groove.buoy.on("welcome", function(data) {
        var rooms = [];
        for(var i in data.rooms) {
            rooms.push(data.rooms[i]);
        }

        $scope.$apply(function($scope) {
            $scope.rooms = rooms;
            $scope.selecting = "room";
        });
    });

    // Listen for any new rooms being created
    groove.buoy.on("newRoom", function(data) {
        $scope.$apply(function($scope) {
            $scope.rooms.push(data.name);
        });
    });

    groove.buoy.on("deleteRoom", function(data) {
        $scope.$apply(function($scope) {
            var i = $scope.rooms.indexOf(data.name);
            if(i == -1) return;
            $scope.rooms.splice(i, 1);
        });
    });
}

RoomListCtrl.$inject = ["$scope", "$location", "groove", "localStorageService"];
