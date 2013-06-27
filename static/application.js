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

    $scope.users = [
        { name: "stevenleeg", active: true, dj: true },
        { name: "celehner", active: false, dj: true },
        { name: "hankcy", active: false, dj: true },
        { name: "rochacko", active: false, dj: true },
        { name: "manyabot", active: false, dj: false },
        { name: "omeglebot", active: false, dj: false },
    ];

    $scope.current_track = {
        title: "True Affection",
        artist: "The Blow"
    }

    $scope.chat_messages = [];

    $scope.currentUser = currentUser;

    $scope.isDJ = function(user) {
        return (user.dj == true);
    }

    $scope.isAudience = function(user) {
        return (user.dj != true);
    }

    $scope.becomeDJ = function() {
        groove.becomeDJ();
    }

    function keepScroll(el, fn) {
        return function keptScroll() {
            var isScrolledToBottom = (el.scrollHeight -
                el.scrollTop - el.clientHeight < 10);
            fn.apply(this, keptScroll.arguments);
            if (isScrolledToBottom) {
                setTimeout(function() {
                    el.scrollTop = el.scrollHeight;
                }, 10);
            }
        };
    }

    var messages_div = document.getElementById("messages");

    $scope.newMessage = keepScroll(messages_div, function() {
        var text = $scope.message_text;
        if (text && text.trim()) {
            $scope.chat_messages.push({
                from: currentUser,
                text: text
            });
            groove.sendChat(text);
        }
        $scope.message_text = "";
    });

    groove.on("chat", keepScroll(messages_div, function(message) {
        $scope.$apply(function($scope) { 
            $scope.chat_messages.push(message);
        });
    }));
}

RoomListCtrl.$inject = ["$scope", "$location", "currentUser", "groove", "localStorageService"];
RoomCtrl.$inject = ["$scope", "$routeParams", "currentUser", "groove", "localStorageService"];
