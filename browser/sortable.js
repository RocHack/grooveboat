// Sortable decorator
// Allows a list to be reordered with drag-and-drop.
module.exports = function sortable(listEl, keypath) {
    var el;
    var startY;
    var startIndex, currentIndex;
    var origNextNode;
    var ractive = this;

    // find the element ancestor corresponding to an item in our list
    function findEl(child) {
        for (var el = child;
            el && el.parentNode != listEl;
            el = el.parentNode);
        return el;
    }

    function onDrag(e) {
        var height = el.clientHeight;

        // swap item down the list
        while (e.clientY - startY > height/2 && el.nextElementSibling) {
            startY += height;
            currentIndex++;
            var nextEl = el.nextElementSibling;
            if (nextEl.nextElementSibling) {
                listEl.insertBefore(el, nextEl.nextElementSibling);
            } else {
                listEl.appendChild(el);
            }
        }

        // swap item up the list
        while (e.clientY - startY < -height/2 &&
                el.previousElementSibling) {
            currentIndex--;
            startY -= height;
            listEl.insertBefore(el, el.previousElementSibling);
        }

        el.style.top = (e.clientY - startY) + 'px';
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
        e.preventDefault();

        if (el) {
            // finish previous drag
            onDragEnd(e);
            return;
        }

        el = findEl(e.target);
        if (!el) {
            console.error('Unable to find list item');
            return;
        }

        el.classList.add('ui-sortable-helper');
        el.style.position = 'relative';
        el.style.zIndex = 10000;
        listEl.style.overflow = 'visible';
        origNextNode = el.nextElementSibling;
        startY = e.clientY;
        var elKeypath = el._ractive.keypath;
        var lastDot = elKeypath.lastIndexOf('.') + 1;
        currentIndex = startIndex = +elKeypath.substr(lastDot);

        document.addEventListener('mousemove', onDrag, false);
        document.addEventListener('mouseup', onDragEnd, false);
    }

    listEl.addEventListener('mousedown', onMouseDown, false);

    return {
        teardown: function() {
            listEl.removeEventListener('mousedown', onMouseDown, false);
        }
    };
};
