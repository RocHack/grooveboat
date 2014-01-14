#  Groovebuoy
A WebRTC signaling server with some other niceties that allow [Grooveboat](https://github.com/rochack/grooveboat) to run smoothly.

# Event flow
As of right now, here's how this event flow should work:

```
*client connects*
server -> welcome
client -> joinRoom
server -> roomInfo

...
*client is messing around*
client -> ping
server -> pong

...
*another client connects elsewhere*
server            -> peerJoined
client (new)      -> sendTo (the new client begins attempting to peer with users)

*another client leaves*
server -> peerLeft
```

# Event documentation

## Server events
These are sent to the server by the client.

### `joinRoom`
Tells the server that you are joining a room. The server will eventually respond with a `roomData` event.

Send data:
```json
{
    "e":    "joinRoom",
    "name": "room name"
}
```

### `ping`
Pings the server!

Send data:
```json
{
    "e": "ping",
}
```

### `sendTo`
Sends a message to another peer (by uuid).


Send data:
```json
{
    "e":   "sendTo",
    "to":  "peer uuid"
    "msg": { ... }
}
```

## Client events
These are events that are received by the peers.

### `welcome`
Sent right after the client connects to the server. Provides some simple information about the session.

Send data:
```json
{
    "e":  "welcome",
    "id": "your-uuid",
}
```

### `peerJoined`
Sent each time a peer joins the current room.

Send data:
```json
{
    "e":  "peerJoined",
    "id": "their-uuid",
}

### `peerLeft`
Sent each time a peer leaves the current room.

Send data:
```json
{
    "e":  "peerLeft",
    "id": "their-uuid",
}

```
### `roomData`
Sent after the client sends the `joinRoom` event. Provides information about a room and its peers.

Send data:
```json
{
    "e":     "roomData",
    "name":  "room name",
    "peers": ["peer-uuid1", "peer-uuid2", ...]
}
```

### `recvMessage`
Sent when you are receiving a message from another peer.

Data:
```json
{
    "e":    "recvMessage",
    "from": "peer-uuid",
    "msg":  { ... }
}
```

### `pong`
Sent after you ping the server

Data
```json
{
    "e":    "pong"
}
```
