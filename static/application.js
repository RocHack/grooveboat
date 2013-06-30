angular.module('grooveboat', ["LocalStorageModule"])
    .config(["$routeProvider", "$locationProvider", function($routeProvider, $locationProvider) {
        $routeProvider
            .when("/", { controller: RoomListCtrl, templateUrl: "static/templates/room_list.html"})
            .when("/room/:room", { controller: RoomCtrl, templateUrl: "static/templates/room.html"})
            .otherwise({redirect_to: "/"});

        $locationProvider.html5Mode(false).hashPrefix("!");
    }])
    .factory("groove", ["localStorageService", function(localStorageService) {
        var groove = new Groove();
        window.groove = groove;

        var name = localStorageService.get("user:name");
        if (!name) {
            name = "Guest " + Math.floor(Math.random()*101);
            localStorageService.set("user:name", name);
        }

        groove.me.name = name;

        return groove;
    }])
    .directive('autoScroll', function() {
        return function(scope, elements, attrs) {
            var el = elements[0];
            function scrollToBottom() {
                el.scrollTop = el.scrollHeight;
            }
            scope.$watch("(" + attrs.autoScroll + ").length", function() {
                var lastElHeight = el.lastElementChild.offsetHeight;
                var isScrolledToBottom = (el.scrollHeight - el.scrollTop -
                    el.clientHeight - lastElHeight) < lastElHeight;
                if (isScrolledToBottom) {
                    scrollToBottom();
                    setTimeout(scrollToBottom, 10);
                }
            });
        };
    }).directive('filesBind', function() {
        return function(scope, el, attrs) {
            el.bind('change', function(e) {
                scope.$apply(function() {
                    scope[attrs.filesBind] = e.target.files;
                });
            });
        };
    });

function RoomListCtrl($scope, $location, groove, localStorageService) {
    var selected = -1;
    $scope.currentUser = groove.me;

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
        localStorageService.set("user:name", groove.me.name);
        $location.path("/room/" + name);
    }
}

function RoomCtrl($scope, $routeParams, groove, localStorageService) {
    groove.joinRoom($routeParams.room);

    $scope.users = [];
    $scope.djs = [];
    $scope.currentTab = "music";
    $scope.tracks = groove.playlists[groove.activePlaylist];
    $scope.files = [];

    $scope.current_track = {
        title: "True Affection",
        artist: "The Blow"
    }

    $scope.chat_messages = [];

    $scope.currentUser = groove.me;
    $scope.users.push(groove.me);

    $scope.switchTab = function(tab) {
        $scope.currentTab = tab;
    }

    $scope.isDJ = function(user) {
        return (user.dj == true);
    }

    $scope.isAudience = function(user) {
        return (user.dj != true);
    }

    $scope.becomeDJ = function() {
        if(!groove.me.dj) {
            groove.becomeDJ();
        } else {
            groove.quitDJing();
        }
    }

    $scope.getJoinText = function() {
        if(groove.me.dj) {
            return "leave";
        } else {
            return "join";
        }
    }

    function watchUser(user) {
        user.on("name", function(new_name) {
            $scope.$digest();
        });
    }

    $scope.newMessage = function() {
        var text = $scope.message_text;
        if (text && text.trim()) {
            $scope.chat_messages.push({
                from: groove.me,
                text: text
            });
            groove.sendChat(text);
        }
        $scope.message_text = "";
    };

    $scope.$watch("files", function() {

        groove.addFilesToQueue($scope.files);
    });

    $scope.$on("$destroy", function() {
        groove.leaveRoom();
    });

    groove.on("chat", function(message) {
        $scope.$apply(function($scope) { 
            $scope.chat_messages.push(message);
        });
    });

    groove.on("djs", function(djs) {
        $scope.$apply(function($scope) {
            $scope.djs = djs;
        });
    });

    groove.on("queueUpdate", $scope.$digest.bind($scope));

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

RoomListCtrl.$inject = ["$scope", "$location", "groove", "localStorageService"];
RoomCtrl.$inject = ["$scope", "$routeParams", "groove", "localStorageService"];
