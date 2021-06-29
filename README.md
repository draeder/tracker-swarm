# tracker-swarm
WebRTC tracker server swarm for P2P applications.

# How it works
Tracker swarm creates a P2P tracker server then shares its URL with other tracker-swarm nodes that use the same swarm name and app name. You may optionally pass in an array of trackers you would like to include in the tracker swarm list.

When a P2P application (e.g. [Bugout](https://github.com/chr15m/bugout), [P2PT](https://github.com/subins2000/p2pt)) queries any tracker swarm node in the swarm with that app name, it retrieves an array of all known good tracker servers serving that app from the tracker swarm. The application can then announce to all of the tracker servers it found.

Each tracker swarm node tests new nodes upon joining/leaving the swarm, as well as the array of trackers it knows about every 60 seconds. If a tracker does not respond, it is dropped from the list of working trackers.

P2P browser applications can retrieve the list of trackers from its URI encoded URL, which is returned in a callback once the tracker swarm node is ready (e.g. `http://localhost:63719/trackers/?swarm-id=my%20swarm%20id?app-id=my%20app%20id`)

Querying that URL, the response looks like so:
```js
["http://localhost:63719","http://localhost:63209","http://localhost:63190"]
```

P2P browser applications can then announce to this array of trackers.

# Usage

`npm i tracker-swarm`

## Server
This is your tracker-swarm node.

### trackerSwarm.start(params, callback)
Starts the tracker swarm instance with the provided parameters. The callback returns the URI encoded tracker swarm node URL for use by client applications to retrieve the array of trackers in the tracker swarm.

```js
const swarmNode = require('tracker-swarm')

let params = {
    swarmId: 'my-swarm-id',
    appId: 'my-app-id',
    host: 'http://localhost',
    port: 0,
    trackers: [],
    maxNodes: 10,
    announce: true
}

swarmNode.start(params, url => {
    console.log(url) // returns the query URL for P2P browser applications to use
})
```

## params
### params.swarmId = [string]
The name/ID of your tracker swarm. If undefined, will default to: `'universal-tracker-swarm'`.

### params.appId = [string]
The name/ID of your P2P application. If undefined, will default to: `'universal-app-name'`.

### params.host = [string]
The host URL of your tracker swarm node. If undefined, will default to: `'http://localhost'`.

### params.port = [number]
The port number for your tracker swarm node's tracker server. Set to `0` (default) for a dynamically assigned random port.

### params.trackers = [array]
An array of known trackers you would like to share with the swarm. As with any other trackers from the swarm, each one is tested and dropped if unresponsive.

### params.maxNodes = [number]
Maximum number of tracker-swarm nodes for this app instance. If undefined, will default to: `10`.

### params.announce = [boolean]
Defines whether or not to announce your tracker swarm node as a destination for connections from other tracker swarm nodes. When set to `false`, your node will not participate in the swarm and will only act as a stand-alone tracker server. If undefined, will default to `true`.

## Browser
This is an example of how your P2P application can use the tracker swarm directly from the browser. A basic working example using [Bugout](https://github.com/chr15m/bugout) is in the examples folder.

```js
let url = `http://localhost:63719/trackers/?swarm-id=my%20swarm%20id?app-id=my%20app%20id` // your tracker-swarm node instance url

fetch(url)
.then(res => res.json())
.then(trackers => {
    p2pApplication(trackers)
})

function p2pApplication(trackers){
    ... // Bugout, P2PT, etc. => announce to trackers
}
```
