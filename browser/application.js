/*
require('jquery-ui/sortable');
require('angular-sanitize/angular-sanitize');
require('angular-local-storage/angular-local-storage');
require('angular-ui-sortable/src/sortable');
require('angular-ui-utils/modules/event/event');
require('angular-ui-utils/modules/keypress/keypress');
*/

var Ractive = require('ractive/build/ractive.runtime');
var Router = Ractive.extend(require('./router'));

var MainCtrl = require('./controllers/MainCtrl');
var RoomListCtrl = require('./controllers/RoomListCtrl');
var RoomCtrl = require('./controllers/RoomCtrl');

// Set up Groove

var Groove = require('./groove');

var groove = new Groove();
window.groove = groove;

groove.connectToBuoy("ws://" + location.hostname + ":8844");

var name = localStorage["user:name"];
var gravatar = localStorage["user:gravatar"];
if (!name) {
    name = "Guest " + Math.floor(Math.random()*101);
    localStorage["user:name"] = name;
}
if(gravatar) {
    groove.me.setGravatar(gravatar);
}
groove.me.setName(name);

// Set up UI

var main = new MainCtrl({
    groove: groove
});

document.addEventListener('DOMContentLoaded', function() {
    main.insert(document.body);
}, false);

// Set up routing

var router = new Router({
    el: main.nodes.content
});
router.setHandler(function(path) {
    if (path == '/') {
        return new RoomListCtrl({
            app: main,
            groove: groove,
            router: router
        });
    } else if (path.indexOf('/room/') === 0) {
        var room = path.substr(6);
        return new RoomCtrl({
            app: main,
            groove: groove,
            router: router,
            room: room
        });
    }
});

/*
new routes()
.get("/:category", function(req) {
      alert("In " + req.params.category);
});
    .navigate({
        path: '/',
        directions: function() {
            setPage(new RoomListCtrl({
                groove: groove
            }));
        }
    })
    .navigate({
        path: '/room/{room}',
        directions: function(params) {
            setPage(new RoomCtrl(params.room));
        }
    })
    .otherwise('/')
    .go();
*/

        /*
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
    });
*/
