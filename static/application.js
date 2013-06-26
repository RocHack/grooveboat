angular.module('grooveboat', ["LocalStorageModule"])
    .config(["$routeProvider", "$locationProvider", function($routeProvider, $locationProvider) {
        $routeProvider
            .when("/", { controller: RoomListCtrl, templateUrl: "static/templates/room_list.html"})
            .when("/room/:room", { controller: RoomCtrl, templateUrl: "static/templates/room.html"})
            .otherwise({redirect_to: "/"});

        $locationProvider.html5Mode(false).hashPrefix("!");
    }])
    .factory("currentUser", ["groove", "localStorageService", function(groove, localStorageService) {
        var user = groove.me;
        var nick = localStorageService.get("user:nickname");
        if (!nick) {
            nick = "Guest " + Math.floor(Math.random()*101);
            localStorageService.set("user:nickname", nick);
        }
        user.nickname = nick;

        return user;
    }])
    .service("groove", Groove);

function RoomListCtrl($scope, $location, currentUser, groove, localStorageService) {
    var selected = -1;
    $scope.currentUser = currentUser;

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
        localStorageService.set("user:nickname", currentUser.nickname);
        $location.path("/room/" + name);
    }
}

function RoomCtrl($scope, $routeParams, currentUser, groove, localStorageService) {
    groove.joinRoom($routeParams.room);

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

    $scope.chat_messages = [
        { from: {nickname: "stevenleeg"}, text: "Hello there, world" },
        { from: {nickname: "celehner"}, text: "Hello world" }
    ];

    $scope.currentUser = currentUser;

    $scope.newMessage = function() {
        var messages_div = document.getElementById("messages");
        var isScrolledToBottom = (messages_div.scrollHeight -
            messages_div.scrollTop - messages_div.clientHeight < 10);

        $scope.chat_messages.push({
            from: currentUser,
            text: $scope.message_text
        });

        groove.sendChat($scope.message_text);
        $scope.message_text = "";

        if (isScrolledToBottom) {
            setTimeout(function() {
                messages_div.scrollTop = messages_div.scrollHeight;
            }, 10);
        }
    };

    groove.on("chat", function(message) {
        $scope.$apply(function($scope) { 
            $scope.chat_messages.push(message);
        });
    });
}

RoomListCtrl.$inject = ["$scope", "$location", "currentUser", "groove", "localStorageService"];
RoomCtrl.$inject = ["$scope", "$routeParams", "currentUser", "groove", "localStorageService"];
