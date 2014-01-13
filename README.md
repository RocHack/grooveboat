# Groovebuoy
A WebRTC signaling server with some other niceties that allow [Grooveboat](https://github.com/rochack/grooveboat) to run smoothly.

# Event documentation

## Server events
These are sent to the server by the client.

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
