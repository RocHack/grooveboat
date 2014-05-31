var Emitter = require('wildemitter');

var STATE_DISCONNECTED = 0,
    STATE_CONNECTED    = 1,
    STATE_RECONNECTING = 2;

/*
* This object represents a connection a to a buoy server
* See https://github.com/RocHack/groovebuoy for deetz
*/
function Buoy(server_url) {
    this.url = server_url;
    this.state = STATE_DISCONNECTED;
    this._msgQueue = [];

    this._wsConnect();

    // Connect to the WebSocket
    Emitter.call(this);
}

Buoy.prototype = new Emitter();

Buoy.prototype._wsConnect = function() {
    this.ws = new WebSocket(this.url, "groovebuoy-0.1");

    this.ws.onopen = this._onWSOpen.bind(this);
    this.ws.onmessage = this._onWSMessage.bind(this);
    this.ws.onclose = this._onWSClose.bind(this);
};

/*
* Called when the websocket connection is opened
*/
Buoy.prototype._onWSOpen = function() {
    console.log("Connection to buoy established");
    this.state = STATE_CONNECTED;

    // Send queued messages
    while(this._msgQueue.length > 0) {
        var packet = this._msgQueue.shift();
        this.send(packet.e, packet.data);
    }
};

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
};

/*
* Called whenever the websocket closes
*/
Buoy.prototype._onWSClose = function() {
    if(this.state == STATE_RECONNECTING) return;

    this.state = STATE_RECONNECTING;
    this.emit("disconnected");
    console.log("Disconnected from buoy! Attempting to reconnect...");

    // Attempt to reconnect
    this._attemptReconnect();
};

Buoy.prototype._attemptReconnect = function() {
    if(this.state == STATE_CONNECTED) {
        console.log("Reconnected!");
        this.emit("reconnected");
        return;
    }

    this._wsConnect();
    setTimeout(this._attemptReconnect.bind(this), 1000);
};

/*
* Sends an event to the server
*/
Buoy.prototype.send = function(event, data) {

    // Not connected? Let's queue it!
    if(this.state != STATE_CONNECTED) {
        this._msgQueue.push({ e: event, data: data });
        return;
    }

    data.e = event;
    this.ws.send(JSON.stringify(data));
};

module.exports = Buoy;
