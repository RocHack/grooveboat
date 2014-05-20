function RoomCtrl($scope, $routeParams, $window, $location, groove, localStorageService) {
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
        // TODO: Maybe have this open a private chat?
        if(user == groove.me) {
            $scope.setOverlay("settings");
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

        groove.vote(direction);
    }

    $scope.getJoinText = function() {
        if(groove.me.dj) {
            return "leave";
        } else {
            return "become a dj";
        }
    }

    $scope.togglePersistTracks = function() {
        $scope.persistPlaylists = !$scope.persistPlaylists;
        localStorageService.set("user:persist", $scope.perstistPlaylists)

        groove.setPersist($scope.persistPlaylists);
    }

    $scope.$on("$destroy", function() {
        groove.leaveRoom();
    });

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
    groove.on("setVote", function(user) {
        $scope.$apply(function() {
            $scope.votes = groove.getVotes();
        });
    });

    groove.on("playlistUpdated", function(playlistName) {
        $scope.$apply(function($scope) {
            $scope.tracks = groove.playlists[playlistName];
        });
    });

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
            player.play();
        } else {
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

    groove.buoy.on("reconnected", function() {
        $scope.$apply(function($scope) {
            $scope.users = [groove.me];
            $scope.djs = [];
            groove.me.setName(groove.me.name);
            groove.me.setGravatar(groove.me.gravatar);
            groove.joinRoom($routeParams.room);
        });
    });
}

RoomCtrl.$inject = ["$scope", "$routeParams", "$window", "$location", "groove", "localStorageService"];
