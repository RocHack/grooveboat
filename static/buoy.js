(function() {
    /*
     * This object represents a connection a to a buoy server
     * See https://github.com/RocHack/groovebuoy for deetz
     */
    function Buoy(server_url) {
        this.url = server_url;
        this.connected = false;
        this._msgQueue = [];

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
        this.connected = true;

        // Send queued messages
        while(this._msgQueue.length > 0) {
            var packet = this._msgQueue.shift();
            this.send(packet.e, packet.data);
        }
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

        // Not connected? Let's queue it!
        if(!this.connected) {
            this._msgQueue.push({ e: event, data: data });
            return;
        }

        data["e"] = event;
        this.ws.send(JSON.stringify(data));
    };

    window.Buoy = Buoy;
})();
