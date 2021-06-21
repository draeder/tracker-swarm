
const swarmNode = require('./../trackerSwarm')

let swarmNodeHostname = 'localhost' // your signal-swarm server's hostname

let options = {
    tls: false, // default=false, describes whether to use "ws:"" (=false), or "wss:"" (=true) as the protocol
    appName: 'my awesome app', // if null/undefined, will join the 'global' swarm
    port: 0, // if 0/null/undefined, will use a random free port
}

swarmNode(swarmNodeHostname, options)