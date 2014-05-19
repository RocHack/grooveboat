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
        if($scope.tempGravatarEmail == undefined) {
            return;
        }

        groove.me.setGravatar($scope.tempGravatarEmail);
        $scope.setOverlay(false);
        localStorageService.set("user:gravatar", groove.me.gravatar);
    };

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
}

