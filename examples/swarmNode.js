const swarmNode = require('../trackerSwarm')

let params = {
    swarmId: 'my swarm id',
    appId: 'my app id',
    host: 'http://localhost',
    port: 0,
    trackers: [],
    maxNodes: 10,
    announce: false
}

swarmNode.start(params, url => {
    console.log(url)
})