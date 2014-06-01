function MainCtrl($scope, groove, localStorageService) {
    $scope.currentUser = groove.me;
    $scope.currentOverlay = false;
    $scope.tempGravatarEmail = groove.me.gravatar;
    $scope.tempUsername = groove.me.name;
    $scope.muted = false;

    $scope.persistPlaylists = localStorageService.get("user:persist") || false;
    groove.setPersist($scope.persistPlaylists);

    $scope.setOverlay = function(overlay) {
        $scope.currentOverlay = overlay;
    };

    $scope.saveSettings = function() {
        // Gravatar
        if($scope.tempGravatarEmail != undefined) {
            groove.me.setGravatar($scope.tempGravatarEmail);
            localStorageService.set("user:gravatar", groove.me.gravatar);
        }

        // Name
        if($scope.tempUsername && $scope.tempUsername.trim()) {
            $scope.currentUser.setName($scope.tempUsername);
            localStorageService.set("user:name", $scope.tempUsername);
        }
        $scope.tempUsername = groove.me.name;
        $scope.setOverlay(false);
    }

    $scope.toggleMute = function() {
        $scope.muted = !$scope.muted;
        $scope.$broadcast("toggleMute");
    };

    $scope.togglePersistTracks = function() {
        $scope.persistPlaylists = !$scope.persistPlaylists;
        localStorageService.set("user:persist", $scope.perstistPlaylists)

        groove.setPersist($scope.persistPlaylists);
    }

    groove.buoy.on("disconnected", function() {
        $scope.$apply(function($scope) {
            $scope.setOverlay("disconnected");
        });
    });

    groove.buoy.on("reconnected", function() {
        $scope.$apply(function($scope) {
            $scope.setOverlay(false);
        });
    });
};

MainCtrl.$inject = ["$scope", "groove", "localStorageService"];

module.exports = MainCtrl;
