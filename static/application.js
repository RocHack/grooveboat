angular.module('grooveboat', [])
    .config(["$routeProvider", "$locationProvider", function($routeProvider, $locationProvider) {
        $routeProvider
            .when("/", { controller: RoomListCtrl, templateUrl: "/static/templates/room_list.html"})
            .when("/room/:room", { controller: RoomListCtrl, templateUrl: "/static/templates/room.html"})
            .otherwise({redirect_to: "/"});

        $locationProvider.html5Mode(false).hashPrefix("!");
    }]);

function RoomListCtrl($scope, $location) {
    var selected = -1;

    $scope.rooms = [
        { name: "Ambient Electronic", selected: false },
        { name: "Indie While You Slack", selected: false }
    ];

    $scope.clickRoom = function(i) {
        if(selected > -1) {
            $scope.rooms[selected].selected = false;
        }

        document.getElementById("join-room").disabled = false;
        $scope.rooms[i].selected = true;
        selected = i;
    }

    $scope.clickJoinRoom = function() {
        var room = $scope.rooms[selected];
        var name = room.name.replace(/\s/g, "-");
        $location.path("/room/" + name);
    }
}

function RoomCtrl($scope) {

}

RoomListCtrl.$inject = ["$scope", "$location"];
