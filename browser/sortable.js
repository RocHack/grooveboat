// Sortable decorator
// Allows a list to be reordered with drag-and-drop.
module.exports = function sortable(listEl, keypath, index) {
    var el;
    var startY;
    var startIndex, currentIndex;
    var origNextNode;
    var ractive = this;
    var scrollY;
    var clientY;
    var listeners = [];

    function addListener(el, name, fn, bubble) {
        listeners.push({el: el, args: [name, fn, !!bubble]});
        el.addEventListener(name, fn, !!bubble);
    }

    function removeListeners() {
        listeners.forEach(function(listener) {
            listener.el.removeEventListener.apply(listener.el, listener.args);
        });
    }

    function updateScroll() {
        scrollY = 0;
        for (var parent = listEl; parent; parent = parent.parentElement) {
            scrollY += parent.scrollTop;
        }
        if (el) {
            drag();
        }
    }

    // keep track of scroll position of list and its ancestors
    for (var parent = listEl; parent; parent = parent.parentElement) {
        addListener(parent, 'scroll', updateScroll);
    }

    updateScroll();

    // find the element ancestor corresponding to an item in our list
    function findEl(child) {
        for (var el = child;
            el && el.parentNode != listEl;
            el = el.parentNode);
        return el;
    }

    function drag() {
        var prevEl, nextEl;
        var y = clientY + scrollY;

        // swap item down the list
        while ((nextEl = el.nextElementSibling) &&
                (y - startY > nextEl.clientHeight/2)) {
            currentIndex++;
            startY += nextEl.clientHeight;
            if (nextEl.nextElementSibling) {
                listEl.insertBefore(el, nextEl.nextElementSibling);
            } else {
                listEl.appendChild(el);
            }
        }

        // swap item up the list
        while ((prevEl = el.previousElementSibling) &&
                (y - startY < -prevEl.clientHeight/2)) {
            currentIndex--;
            startY -= prevEl.clientHeight;
            listEl.insertBefore(el, prevEl);
        }

        el.style.top = (y - startY) + 'px';
    }

    function onDrag(e) {
        clientY = e.clientY;
        drag();
    }

    function onDragEnd(e) {
        document.removeEventListener('mousemove', onDrag, false);
        document.removeEventListener('mouseup', onDragEnd, false);
        onDrag(e);

        var itemEl = el;
        el.classList.remove('ui-sortable-helper');
        el.style.position = '';
        el.style.top = '';
        el.style.zIndex = '';
        listEl.style.overflow = '';
        el = null;

        if (currentIndex == startIndex) {
            // node did not move
            return;
        }

        // put element back in place
        if (origNextNode) {
            listEl.insertBefore(itemEl, origNextNode);
        } else {
            listEl.appendChild(itemEl);
        }

        // update model
        var arrayOrig = ractive.get(keypath);
        var array = arrayOrig.slice();
        var item = array[startIndex];
        if (!item) {
            console.error('Unable to find item', array, startIndex);
            return;
        }
        item.playlistPosition = currentIndex;
        // remove item from old position
        array.splice(startIndex, 1);
        // add item to array at new position
        array.splice(currentIndex, 0, item);

        array._dragging = true;
        //ractive.merge(keypath, array);
        /*
        arrayOrig.sort(function(a, b) {
            return array.indexOf(a) - array.indexOf(b);
        });
        */
        ractive.set(keypath, array);

        array._dragging = false;
    }

    function onMouseDown(e) {
        if (e.button == 2) {
            // leave right click alone
            return;
        }

        if (el) {
            // finish previous drag
            onDragEnd(e);
            return;
        }

        el = findEl(e.target);
        if (!el || !el._ractive || !el._ractive.index) {
            // clicked in the list but outside a list item
            return;
        }

        // ignore?
        if(el.className.indexOf("disable-sort") != -1) {
            el = null;
            return;
        }

        e.preventDefault();

        el.classList.add('ui-sortable-helper');
        el.style.position = 'relative';
        el.style.zIndex = 10000;
        listEl.style.overflow = 'visible';
        origNextNode = el.nextElementSibling;
        startY = e.clientY + scrollY;
        currentIndex = startIndex = el._ractive.index[index];

        document.addEventListener('mousemove', onDrag, false);
        document.addEventListener('mouseup', onDragEnd, false);
    }

    addListener(listEl, 'mousedown', onMouseDown);

    return {
        teardown: removeListeners
    };
};
