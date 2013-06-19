angular.module('grooveboat', [])
    .config(["$routeProvider", "$locationProvider", function($routeProvider, $locationProvider) {
        $routeProvider
            .when("/", { controller: RoomListCtrl, templateUrl: "static/templates/room_list.html"})
            .when("/room/:room", { controller: RoomCtrl, templateUrl: "static/templates/room.html"})
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
    $scope.djs = [
        { name: "stevenleeg", active: true },
        { name: "celehner", active: false },
        { name: "rochacko", active: false },
        { name: "hankcy", active: false }
    ];

    $scope.audience = [
        { name: "manyabot" },
        { name: "omeglebot" }
    ];

    $scope.current_track = {
        title: "True Affection",
        artist: "The Blow"
    }
}

RoomListCtrl.$inject = ["$scope", "$location"];
