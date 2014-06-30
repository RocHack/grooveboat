var Emitter = require('wildemitter');

var DB_VERSION = 3;

// Helper functions for queue
function ensureDb(origFn) {
    return function fn() {
        if (this.db) {
            origFn.apply(this, fn.arguments);
        } else {
            this._queue.push([origFn, fn.arguments]);
        }
    };
}
function exec(handler) {
    handler[0].apply(this, handler[1]);
}

// turn a track into something we can put in the db
// excluding the file
function exportTrack(t) {
    if (!t) return null;
    var track = {};
    for (var i in t) {
        if (typeof t[i] != 'object') {
            track[i] = t[i];
        }
    }
    return track;
}

// turn a file into something we can put in the db
function fileToDataURI(file, cb) {
    var fr = new FileReader();
    fr.onloadend = function() {
        cb(fr.result);
    };
    fr.readAsDataURL(file);
}

function dataURItoBlob(dataURI) {
    if (!dataURI) return null;
    var split = dataURI.split(',');
    var binary = atob(split[1]);
    var array = [];
    for(var i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
    }

    return new Blob([new Uint8Array(array)], {type: split[0]});
}

function GrooveDB() {
    Emitter.call(this);

    this._queue = [];
    this.dbReq = window.indexedDB.open("grooveboat", DB_VERSION);
    this.db = null;

    this.dbReq.onerror = this._onRequestError.bind(this);
    this.dbReq.onsuccess = this._onRequestSuccess.bind(this);
    this.dbReq.onupgradeneeded = this._onUpgradeNeeded.bind(this);
    this.dbReq.onblocked = this._onRequestBlocked.bind(this);
}

GrooveDB.prototype = Object.create(Emitter.prototype, {
    constructor: {value: GrooveDB}
});

/*
* Called whenever the database request fails
*/
GrooveDB.prototype._onRequestError = function(e) {
    console.log("[db] Could not open indexedb", e);
    this.db = null;
};

/*
* Called when the request is blocked, due to other tabs having the db open
*/
GrooveDB.prototype._onRequestBlocked = function() {
    console.log("[db] Request blocked");
    this.emit("blocked");
};

/*
* Called when the db request goes through
*/
GrooveDB.prototype._onRequestSuccess = function(e) {
    this.db = e.target.result;
    this.db.onerror = this._onDbError.bind(this);

    // Empty the waiting queue
    this._queue.forEach(exec.bind(this));

    console.log("[db] Connected to local persistent store");
    this.emit("open");
};

/*
* Called when we need to run a schema upgrade on the db (if it's new
* or existing w/old version)
*/
GrooveDB.prototype._onUpgradeNeeded = function(e) {
    // don't expose the db until the upgrade transaction is finished
    var db = e.target.result;
    var tx = e.target.transaction;
    var musicStore, fileStore;

    if (e.oldVersion < 2) {
        // the first version of the database
        musicStore = db.createObjectStore("music", { keyPath: "id" });
        console.log("[db] Initialized music database");
    }
    if (e.oldVersion < 3) {
        // Move track file data into seperate object store
        fileStore = db.createObjectStore("files");
        musicStore = tx.objectStore("music");

        musicStore.openCursor().onsuccess = function(e) {
            var c = e.target.result;

            if(c) {
                console.log('[db] Migrating track', c.value.title);
                fileStore.put(c.value.file, c.value.id);
                delete c.value.file;
                musicStore.put(c.value);
                c.continue();
            }
        };
    }
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

    var trackObject = exportTrack(track);
    var self = this;
    music.get(track.id).onsuccess = function(e) {
        var resultTrack = e.target.result;

        if (resultTrack) {
            // The track is already in the DB, so we don't need to add the file.
            // Update the track.
            music.put(trackObject);
            return;
        }

        // If the track doesn't have a file,
        // add the track object in this transaction.
        if (!track.file) {
            music.add(trackObject);
        }

        // Add the track's file when first adding the track

        // We need to convert the file to a dataURL because chrome doesn't
        // support blobs in IndexedDB yet. See this chrome bug:
        // https://code.google.com/p/chromium/issues/detail?id=108012
        if (track.file) fileToDataURI(track.file, function(file) {

            // Build new transaction to put the track/file
            var t = self.db.transaction(["music", "files"], "readwrite");
            var music = t.objectStore("music");
            var files = t.objectStore("files");

            // Add the track and file
            music.add(trackObject);
            files.add(file, track.id);
        });
    };
};

/*
* Deletes a track from the store
*/
GrooveDB.prototype.deleteTrack = ensureDb(function(track) {
    var t = this.db.transaction(["music", "files"], "readwrite");
    var music = t.objectStore("music");
    var files = t.objectStore("files");

    music.delete(track.id);
    files.delete(track.id);
    console.log("[db] Deleted track "+ track.title);
});

/*
* Adds a song to the persist queue if we're not connected or persists
* it immediately if we are
*/
GrooveDB.prototype.storeTrack = ensureDb(function(track) {
    this._persistTrack(track);
});

/*
* Clears all songs from the store
*/
GrooveDB.prototype.clearDb = ensureDb(function() {
    var tx = this.db.transaction(["music", "files"], "readwrite");
    tx.objectStore("music").clear();
    tx.objectStore("files").clear();
    tx.oncomplete = function() {
        console.log("[db] Deleted tracks from persistent store");
    };
});

/*
* Retreives the stored tracks and sends them as a list to the callback
*/
GrooveDB.prototype.getTracks = ensureDb(function(callback) {
    var tx = this.db.transaction(["music"], "readwrite");
    var music = tx.objectStore("music");
    var tracks = [];
    music.openCursor().onsuccess = function(e) {
        var c = e.target.result;

        if(c) {
            tracks.push(c.value);
            c.continue();
        } else {
            callback(tracks);
        }
    };
});

/*
 * Retrieves the stored blob for the given track
 */
GrooveDB.prototype.getTrackFile = ensureDb(function(track, callback) {
    if (!track || !track.id) {
        return callback(null);
    }
    var files = this.db.transaction(["files"], "readonly").objectStore("files");
    files.get(track.id).onsuccess = function(e) {
        callback(dataURItoBlob(e.target.result));
    };
});

module.exports = GrooveDB;
