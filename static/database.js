(function() {
    var DB_VERSION = 2;

    function GrooveDB() {
        this._persistQueue = [];
        this._getCallbackQueue = [];
        this.dbReq = window.indexedDB.open("grooveboat", DB_VERSION);
        this.db = null;

        this.dbReq.onerror = this._onRequestError.bind(this);
        this.dbReq.onsuccess = this._onRequestSuccess.bind(this);
        this.dbReq.onupgradeneeded = this._onUpgradeNeeded.bind(this);
    }

    /*
     * Called whenever the database request fails
     */
    GrooveDB.prototype._onRequestError = function(e) {
        console.log("[db] Could not open indexedb");
        this.db = null;
    };

    /*
     * Called when the db request goes through
     */
    GrooveDB.prototype._onRequestSuccess = function(e) {
        this.db = e.target.result;
        this.db.onerror = this._onDbError.bind(this);

        // Empty the waiting queue
        if(this._persistQueue.length != 0) {
            this._persistQueue.map(this._persistTrack.bind(this));
        }
        if(this._getCallbackQueue.length != 0) {
            this._getCallbackQueue.map(this.getTracks.bind(this));
        }

        console.log("[db] Connected to local persistent store");
    };

    /*
     * Called when we need to run a schema upgrade on the db (if it's new
     * or existing w/old version)
     */
    GrooveDB.prototype._onUpgradeNeeded = function(e) {
        this.db = e.target.result;

        var musicStore = this.db.createObjectStore("music", { keyPath: "id" });
        console.log("[db] Initiated music database");
    };

    /*
     * Called whenever there is an error in a transaction
     */
    GrooveDB.prototype._onDbError = function(e) {
        console.log("[db] IndexedDB error: "+ e.target.errorCode);
    };

    /*
     * Helper method for persisting tracks
     */
    GrooveDB.prototype._persistTrack = function(track) {
        var t = this.db.transaction(["music"], "readwrite");
        var music = t.objectStore("music");
        console.log("Attempting to persist track");

        music.get(track.id).onsuccess = function(e) {
            var resultTrack = e.target.result;
            if(resultTrack) {
                console.log("[db] Track:"+ resultTrack.title +" already exists. Skipping!");
                return;
            }

            music.add(track);
            console.log("[db] Track: "+ track.title +" added to persistent store");
        }
    };

    /*
     * Adds a song to the persist queue if we're not connected or persists
     * it immediately if we are
     */
    GrooveDB.prototype.storeTrack = function(track) {
        if(!this.db) {
            this._persistQueue.push(track);
            return;
        }

        this._persistTrack(track);
    };

    /*
     * Clears all songs from the store
     */
    GrooveDB.prototype.clearDb = function() {
        if(!this.db) {
            // TODO: Something more meaniningful here
            return;
        }

        var music = this.db.transaction("music", "readwrite").objectStore("music");
        var self = this;
        music.openCursor().onsuccess = function(e) {
            var c = e.target.result;

            if(c) {
                console.log("[db] Deleting track "+ c.value.title +" from persistent store");
                music.delete(c.key);
                c.continue();
            }
        };
    };

    /*
     * Retreives the stored tracks and sends them as a list to the callback
     */
    GrooveDB.prototype.getTracks = function(callback) {
        if(!this.db) {
            this._getCallbackQueue.push(callback);
            return;
        }

        console.log("[db] Loading persisted tracks");
        
        var music = this.db.transaction(["music"], "readwrite").objectStore("music");
        var self = this;
        var tracks = [];
        music.openCursor().onsuccess = function(e) {
            var c = e.target.result;

            if(c) {
                console.log("[db] Found "+ c.value.title);
                tracks.push(c.value);
                c.continue();
            } else {
                callback(tracks);
            }
        };
    }

    window.GrooveDB = GrooveDB;
})();
