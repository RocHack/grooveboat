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
        var name = localStorageService.get("user:name");
        if (!name) {
            name = "Guest " + Math.floor(Math.random()*101);
            localStorageService.set("user:name", name);
        }
        user.name = name;

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
        localStorageService.set("user:name", currentUser.name);
        $location.path("/room/" + name);
    }
}

function RoomCtrl($scope, $routeParams, currentUser, groove, localStorageService) {
    groove.joinRoom($routeParams.room);

    $scope.users = [];

    $scope.current_track = {
        title: "True Affection",
        artist: "The Blow"
    }

    $scope.chat_messages = [];

    $scope.currentUser = currentUser;
    $scope.users.push(currentUser);

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

    function watchUser(user) {
        user.on("name", function(new_name) {
            $scope.$digest();
        });
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

    groove.on("peerConnected", function(user) {
        $scope.$apply(function($scope) {
            $scope.users.push(user);
            watchUser(user);
        });
    });

    groove.on("peerDisconnected", function(user) {
        $scope.$apply(function($scope) {
            var i =  $scope.users.indexOf(user);
            if(i == -1) {
                return;
            }

            $scope.users.splice(i, 1);
        });
    });
}

RoomListCtrl.$inject = ["$scope", "$location", "currentUser", "groove", "localStorageService"];
RoomCtrl.$inject = ["$scope", "$routeParams", "currentUser", "groove", "localStorageService"];
