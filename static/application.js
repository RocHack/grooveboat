angular.module('grooveboat', ["ngRoute", "LocalStorageModule", "ngSanitize", "ui"])
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
        return function(scope, el, attr) {
            function dragEnter(e) {
                e.stopPropagation();
                e.preventDefault();

                if(!attr.dragEnter) return;

                scope.$apply(function() {
                    scope.$eval(attr.dragEnter);
                });
            }

            function dragLeave(e) {
                e.stopPropagation();
                e.preventDefault();

                if(!attr.dragLeave) return;

                scope.$apply(function() {
                    scope.$eval(attr.dragLeave);
                });
            }

            function dragOver(e) {
                e.stopPropagation();
                e.preventDefault();
            }

            function drop(e) {
                e.stopPropagation();
                e.preventDefault();

                scope.$apply(function() {
                    scope.$eval(attr.dragLeave);
                });

                scope.$apply(function() {
                    scope.files = e.dataTransfer.files;
                });
            }

            function click() {
                var input = document.createElement("input");
                input.type = "file";
                function onChange() {
                    scope.$apply(function() {
                        scope.files = input.files;
                    });
                    input.removeEventListener("change", onChange);
                }
                input.addEventListener("change", onChange, false);
                input.click();
            }

            el[0].addEventListener("dragenter", dragEnter, false);
            el[0].addEventListener("dragleave", dragLeave, false);
            el[0].addEventListener("dragover", dragOver, false);
            el[0].addEventListener("drop", drop, false);
            el[0].addEventListener("click", click, false);
        };
    }).filter('emoji', function() {
        var emoji = window.returnExports;
        return function(text) {
            return emoji(text, 'static/lib/emoji/pngs');
        };
    }).filter("mention", function() {
        return function(text, name) {
            return text.replace(name, "<span class=\"mention\">"+ name +"</span>");
        };
    });
