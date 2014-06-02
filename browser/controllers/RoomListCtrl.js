function RoomListCtrl($scope, $location, groove, localStorageService) {
    /*
     * Room selection
     */
    $scope.room_selected = -1;
    $scope.creating_room = false;
    $scope.new_room_name = "";
    $scope.rooms = groove.rooms;

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
     * Listeners
     */
    // Listen for any new rooms being created or removed
    var digest = $scope.$digest.bind($scope);
    groove.on("roomsChanged", digest);
}

RoomListCtrl.$inject = ["$scope", "$location", "groove", "localStorageService"];

module.exports = RoomListCtrl;
