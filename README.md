# tracker-swarm
WebRTC tracker server swarm for P2P applications.

# How it works
Tracker-swarm creates a P2P tracker server then shares its URL with other tracker-swarm nodes that share the same app name.

When a P2P application (e.g. [Bugout](https://github.com/chr15m/bugout), [P2PT](https://github.com/subins2000/p2pt)) connects to any tracker-swarm node with that app name, it retrieves all of the tracker server URLs for the nodes in that swarm instance. The application can then announce to all of the tracker servers in the tracker-swarm.

# Usage

`npm i tracker-swarm`

## Example
Examples can be found in the /examples folder.

### Server
This is your tracker-swarm node.

```
const swarmNode = require('tracker-swarm')

// Your tracker-swarm server's hostname. 
// If using Heroku, Glitch, or similar, re-deploy once you know and have updated your hostname
let hostname = 'localhost'

let options = {
    tls: false, // default=false, describes whether to use "ws:"" (false), or "wss:"" (true) as the node url's protocol
    appName: 'my awesome app', // if null/undefined, will join the 'global' swarm
    port: 30210, // set to 0 for Heroku, Glitch, or similar
}

swarmNode(nostname, options)
```

### Browser
This is an example of how your P2P application can use the tracker-swarm.

The URL in the example is the main entrypoint for your application to retrieve all of the tracker-swarm node tracker URLs. This is your node's hostname, followed by the port number (if needed);  `/trackers` at the end is **required**.

```
let url = `http://localhost:30210/trackers` // your tracker-swarm node instance url

let trackers = []

fetch(url)
.then(res => res.json())
.then(json => {
    if(json.appName != appName){
        appName = 'universal-tracker-swarm'
    }
    let appId = uuidv5(appName, uuidv5.URL)
    json.trackers.forEach(ans => {
        let bytes = CryptoJS.AES.decrypt(ans.toString(), appId)
        let tracker = bytes.toString(CryptoJS.enc.Utf8)
        trackers.push(tracker)
    })
    p2pApplication(trackers)
})

function p2pApplication(trackers){
    ... // Bugout, P2PT, etc.
}
```