angular.module('grooveboat', ["LocalStorageModule", "ngSanitize"])
    .config(["$routeProvider", "$locationProvider", function($routeProvider, $locationProvider) {
        $routeProvider
            .when("/", { 
                controller: RoomListCtrl, 
                templateUrl: "static/templates/room_list.html"
            })
            .when("/room/:room", { 
                controller: RoomCtrl, 
                templateUrl: "static/templates/room.html"
            })
            .otherwise({redirect_to: "/"});

        $locationProvider.html5Mode(false).hashPrefix("!");
    }])
    .run(function($rootScope, $location) {
        $rootScope.location = $location;
    })
    .factory("groove", ["localStorageService", function(localStorageService) {
        var groove = new Groove();
        window.groove = groove;

        groove.connectToBuoy("ws://"+ window.location.hostname +":8844");

        var name = localStorageService.get("user:name");
        var gravatar = localStorageService.get("user:gravatar");
        if (!name) {
            name = "Guest " + Math.floor(Math.random()*101);
            localStorageService.set("user:name", name);
        }
        if(gravatar) {
            groove.me.setGravatar(gravatar);
        }

        groove.me.setName(name);

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
    }).directive('dropFiles', function() {
        function dragEnter(e) {
            e.stopPropagation();
            e.preventDefault();
            console.log("Enter");
        }

        function dragOver(e) {
            e.stopPropagation();
            e.preventDefault();
        }

        return function(scope, el, attr) {
            function drop(e) {
                e.stopPropagation();
                e.preventDefault();

                console.log("Drop");
                scope.$apply(function() {
                    scope.files = e.dataTransfer.files;
                });
            }

            el.bind("dragenter", dragEnter);
            el.bind("dragover", dragOver);
            el.bind("drop", drop);
        };
    }).filter('emoji', function() {
        var emoji = window.returnExports;
        return function(text) {
            return emoji(text, 'static/lib/emoji/pngs');
        };
    });

function MainCtrl($scope, groove, localStorageService) {
    $scope.currentUser = groove.me;
    $scope.currentOverlay = false;
    $scope.tempGravatarEmail = groove.me.gravatar;

    $scope.setOverlay = function(overlay) {
        $scope.currentOverlay = overlay;
    };

    $scope.saveName = function() {
        $scope.currentUser.setName($scope.tempUsername);
        localStorageService.set("user:name", $scope.tempUsername);
        $scope.setOverlay(false);
    };

    $scope.saveGravatarEmail = function() {
        console.log("Wat");
        if($scope.tempGravatarEmail == undefined) {
            return;
        }

        groove.me.setGravatar($scope.tempGravatarEmail);
        groove.sendGravatar();
        $scope.setOverlay(false);
        localStorageService.set("user:gravatar", groove.me.gravatar);
    };

}

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

function RoomCtrl($scope, $routeParams, $window, groove, localStorageService) {
    /*
     * Listeners on the UI
     */
    groove.joinRoom($routeParams.room);

    $scope.users = [];
    $scope.djs = [];
    $scope.currentTab = localStorageService.get("user:tab") || "music";
    $scope.currentOverlay = false;
    $scope.tracks = groove.playlists[groove.activePlaylist];
    $scope.files = [];

    $scope.currentTrack = null;
    $scope.votes = { yes: 0, no: 0 };
    $scope.chat_messages = [];
    $scope.newMessages = false;
    $scope.users.push(groove.me);

    var player = $window.document.createElement("audio");
    window.player = player;
    var activeTrack;
    player.addEventListener("canplay", function() {
        var track = groove.activeTrack;
        if (track == activeTrack) return;
        activeTrack = track;
        console.log("canplay", track && track.currentTime, track);
        if (track) {
            player.currentTime = track.currentTime;
            groove.canPlayTrack(player.duration);
            player.play();
        }
    }, false);

    $scope.switchTab = function(tab) {
        if(tab == "chat" && $scope.newMessages) {
            $scope.newMessages = false;
        }

        localStorageService.set("user:tab", tab);
        $scope.currentTab = tab;
    }

    $scope.clickUser = function(user) {
        if(user == groove.me) {
            $scope.setOverlay("change-avatar");
        } 
    }

    $scope.isDJ = function(user) {
        return (user.dj == true);
    }

    $scope.isAudience = function(user) {
        return (user.dj != true);
    }

    $scope.becomeDJ = function() {
        if($scope.tracks.length == 0) {
            $scope.setOverlay("no-tracks");
            return;
        }

        if(!groove.me.dj) {
            groove.becomeDJ();
        } else {
            groove.quitDJing();
        }
    }

    $scope.vote = function(direction) {
        if(groove.activeDJ == groove.me) {
            return;
        }

        handleVote(groove.me.vote, direction);
        groove.vote(direction);
    }

    $scope.getJoinText = function() {
        if(groove.me.dj) {
            return "leave";
        } else {
            return "become a dj";
        }
    }

    function handleVote(previous, next) {
        if(previous == 1) {
            $scope.votes.yes -= 1;
        } else if(previous == -1) {
            $scope.votes.no -= 1;
        }

        if(next == 1) {
            $scope.votes.yes += 1;
        } else if(next == -1) {
            $scope.votes.no += 1;
        }
    }

    var digest = $scope.$digest.bind($scope);
    function watchUser(user) {
        user.on("name", digest);
        user.on("vote", digest);
        user.on("gravatar", digest);
        user.on("vote", function(previous, next) {
            handleVote(previous, next);
            digest();
        });
    }

    $scope.newMessage = function() {
        var text = $scope.message_text;
        var last = groove.lastChatAuthor;
        if(text && text.trim()) {
            $scope.chat_messages.push({
                from: groove.me,
                text: text,
                isContinuation: last && last == groove.me
            });
            groove.lastChatAuthor = groove.me;
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

    /*
     * Listeners from the buoy server
     */
    groove.on("chat", function(message) {
        $scope.$apply(function($scope) { 
            if($scope.currentTab != "chat") {
                $scope.newMessages = true;
            }

            var last = groove.lastChatAuthor;
            message.isContinuation = (last && last == message.from);
            groove.lastChatAuthor = message.from;
            $scope.chat_messages.push(message);
        });
    });

    groove.on("djs", function(djs) {
        $scope.$apply(function($scope) {
            $scope.djs = djs;
        });
    });

    groove.on("activeDJ", function() {
        $scope.$apply(function($scope) {
            $scope.activeDJ = groove.activeDJ;
        });
    });

    groove.on("activeTrack", function() {
        $scope.$apply(function($scope) {
            $scope.currentTrack = groove.activeTrack;
        });
    });

    groove.on("activeTrackURL", function() {
        var track = groove.activeTrack;
        var url = track && track.url;
        if (url) {
            console.log("got track url", url.length, url.substr(0, 256));
            player.src = url;
            console.log('current time', track.currentTime, track);
        } else {
            console.log("no track");
            player.pause();
        }
    });

    groove.on("emptyPlaylist", function() {
        alert("Add some music to your playlist first.");
    });

    groove.on("queueUpdate", digest);

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
RoomCtrl.$inject = ["$scope", "$routeParams", "$window", "groove",
    "localStorageService"];
