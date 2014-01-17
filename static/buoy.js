(function() {
    /*
     * This object represents a connection a to a buoy server
     * See https://github.com/RocHack/groovebuoy for deetz
     */
    function Buoy(server_url) {
        this.url = server_url;

        // Connect to the WebSocket
        this.ws = new WebSocket(this.url, "groovebuoy-0.1");
        this.ws.onopen = this._onWSOpen.bind(this);
        this.ws.onmessage = this._onWSMessage.bind(this);

        WildEmitter.call(this);
    }

    Buoy.prototype = new WildEmitter;

    /*
     * Called when the websocket connection is opened
     */
    Buoy.prototype._onWSOpen = function() {
        console.log("Connection to buoy established");
    }

    /*
     * Called every time a message is received from the websocket
     */
    Buoy.prototype._onWSMessage = function(data) {
        var msg;
        try {
            msg = JSON.parse(data.data);
        } catch(e) {
            console.log("Received invalid packet from buoy");
            console.log(data.data);
            return;
        }

        this.emit(msg.e, msg);
    }

    /*
     * Sends an event to the server
     */
    Buoy.prototype.send = function(event, data) {
        data["e"] = event;
        this.ws.send(JSON.stringify(data));
    }

    window.Buoy = Buoy;
})();
