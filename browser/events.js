module.exports = {
    enter: function(node, fire) {
        function onKeydown(e) {
            if (e.keyCode == 13 && !e.shiftKey) {
                fire({
                    node: node,
                    original: e
                });
            }
        }
        node.addEventListener('keydown', onKeydown, false);
        return {
            teardown: function() {
                node.removeEventListener('keydown', onKeydown, false);
            }
        };
    },

    dragend: function(node, fire) {
        function shoot(e) {
            fire({
                node: node,
                original: e
            });
        }
        node.addEventListener('dragleave', shoot, false);
        node.addEventListener('drop', shoot, false);
        return {
            teardown: function() {
                node.removeEventListener('dragleave', shoot, false);
                node.removeEventListener('drop', shoot, false);
            }
        };
    },

    dropfiles: function(node, fire) {
        function resolve(e, files) {
            fire({
                node: node,
                original: e,
                files: files
            });
        }

        function preventDefault(e) {
            e.preventDefault();
        }

        function drop(e) {
            e.preventDefault();
            resolve(e, e.dataTransfer.files);
        }

        function click() {
            var input = document.createElement('input');
            input.type = 'file';
            function onChange(e) {
                resolve(e, input.files);
                input.removeEventListener('change', onChange);
            }
            input.addEventListener('change', onChange, false);
            input.click();
        }

        node.addEventListener('dragenter', preventDefault, false);
        node.addEventListener('dragleave', preventDefault, false);
        node.addEventListener('dragover', preventDefault, false);
        node.addEventListener('drop', drop, false);
        node.addEventListener('click', click, false);

        return {
            teardown: function() {
                node.removeEventListener('dragenter', preventDefault,false);
                node.removeEventListener('dragleave', preventDefault,false);
                node.removeEventListener('dragover', preventDefault, false);
                node.removeEventListener('drop', drop, false);
                node.removeEventListener('click', click, false);
            }
        };
    }
};
