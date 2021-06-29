const hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const Server = require('bittorrent-tracker').Server
const fetch = require('node-fetch')
const swarm = hyperswarm()

module.exports = {start}

function start(opts, callback){
    let swarmId = opts.swarmId || 'universal-tracker-swarm'
    let appId = opts.appId || 'universal-app-name'
    let tracker = opts.host || 'http://localhost'
    let initialTrackers = opts.trackers
    let port = opts.port || 0
    let maxNodes = opts.maxNodes || 10
    let announce = opts.announce || true

    let trackers = [{appId: appId, trackers:[]}]

    for(item in initialTrackers){
        let tr = convertTrackerProtocol(initialTrackers[item])
        for(app in trackers){
            trackers[app].trackers.push(tr)
        }
    }

    // look for peers listed under this topic
    const topic = crypto.createHash('sha256')
    .update(swarmId) // some topic to connect
    .digest()
    
    function trackerSwarm(){
        swarm.join(topic, {
            lookup: true, // find & connect to peers
            announce: announce // optional- announce self as a connection target
        }, (err, joined) => {
            if(err) console.log(err)
        })
        
        swarm.on('connection', (socket, info) => {

            const {
                priority,
                status,
                retries,
                peer,
                client
            } = info

            socket.write(Buffer.from(JSON.stringify(trackers), 'utf8'))
    
            socket.on("data", data => {
                if(client){
                    let trackerObj = JSON.parse(data.toString())
                    for(item in trackerObj){
                        for(tracker in trackerObj[item].trackers){
                            let trackerTest = trackerObj[item].trackers[tracker]
                            testTracker(trackerObj[item].appId, trackerTest)
                        }
                    }
                }
            })
        })
        
        swarm.on('disconnection', (socket, info)=>{
            const {
                priority,
                status,
                retries,
                peer,
                client
            } = info
    
            if(!client) {
                for(item in trackers){
                    for(tracker in trackers[item].trackers){
                        trackerToTest = convertTrackerProtocol(trackers[item].trackers[tracker])
                        testTracker(appId, trackerToTest)
                    }
                }
            }
        })
    }
    
    // Tracker server
    var server = new Server({
        udp: false,
        http: true,
        ws: true,
        stats: true,
    })
    
    server.http.on('request', (req, res)=> {
        let headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "X-Requested-With, Content-Type, Accept",
            "Access-Control-Allow-Methods": "GET"
        }
        let test = encodeURI(`/trackers/?swarm-id=${swarmId}?app-id=${appId}`)
        if(req.url == test){
            res.writeHead(200, headers);
            //res.end('hello')
            let items
            for(item in trackers){
                items = trackers[item].trackers
            }
            res.end(JSON.stringify(items))
        } else
        if(req.url != test){
            res.end('404 not found');
        } else {
            res.writeHead(404);
            res.end('404 not found');
        }
    })
    
    server.on('start', (address, info) => {

    })
    
    server.on('error', function (err) {
        // fatal server error!
        console.error(`Error: ${err.message}`)
    })
    
    server.on('warning', function (err) {
        // client sent bad data. probably not a problem, just a buggy client.
        console.warn(`Warning: ${err.message}`)
    })
    
    server.on('listening', function () {
        port = server.ws.address().port

        console.log(`Tracker swarm server listening on ws port: ${port}`)
        console.log()

        let trackerToTest = convertTrackerProtocol(tracker, port)

        let queryUrl = new URL(trackerToTest)
    
        if(queryUrl.protocol == 'ws:'){
            queryUrl.protocol = 'http:'
        } else
        if(queryUrl.protocol == 'wss:'){
            queryUrl.protocol = 'https:'
        }
    
        let newTracker = queryUrl.origin
    
        let trackersUrl = encodeURI(`${queryUrl.href}trackers/?swarm-id=${swarmId}?app-id=${appId}`)
        if(callback){
            callback(trackersUrl)
        }
    
        
        newTracker = convertTrackerProtocol(tracker, port)
        trackers = [{appId: appId, trackers:[]}]
        trackers[0].trackers.push(newTracker)
    
        testTracker(appId, newTracker)

    
        trackerSwarm()
        setInterval(()=>{
            for(item in trackers){
                for(tr in trackers[item].trackers){
                    testTracker(appId, trackers[item].trackers[tr])
                }
            }
        }, 60000)
    
    })
    
    // start tracker server listening! Use 0 to listen on a random free port.
    server.listen(port ||process.env.PORT || 0)
    
    function testTracker(appId, newTracker){
        let trackerUrl = new URL(newTracker)
        if(trackerUrl.protocol == 'ws:'){
            trackerUrl.protocol = 'http:'
        } else
        if(trackerUrl.protocol == 'wss:'){
            trackerUrl.protocol = 'https:'
        }
    
        newTracker = trackerUrl.origin
    
        let peerId = '-DE13F0-' + crypto.randomBytes(6).toString('hex')
        let hash = crypto.randomBytes(20).toString('hex')
        let uploaded = 1024 * 16
        let downloaded = 1024 * 16
        let trackerTestUrl = [
            newTracker,
            '?info_hash=',
            encodeURI(hash),
            '&peer_id=',
            peerId,
            '&port=',
            port,
            '&uploaded=',
            uploaded,
            '&downloaded=',
            downloaded,
            '&compact=1'
        ].join('')
        
        fetch(trackerTestUrl)
        .then(res => res)
        .then(res => {
            if(res.status != 200){
                badTracker(newTracker)
            } else {
                goodTracker(newTracker)
            }
        })
        .catch(err => {
            badTracker(newTracker, err)
        })
    
        function goodTracker(newTracker){
            newTracker = convertTrackerProtocol(newTracker)
            for(item in trackers){
                let found = trackers[item].trackers.includes(newTracker)
                if(!found && trackers[item].appId === appId && trackers[item].trackers.length != maxNodes && announce == true){
                    trackers[item].trackers.push(newTracker)
                }
            }
        }
        
        function badTracker(newTracker, err){
            for(item in trackers){
                if(trackers[item].appId === appId){
                    newTracker = convertTrackerProtocol(newTracker)
                    let index = trackers[item].trackers.indexOf(newTracker)
                    if (index !== -1) {
                        trackers[item].trackers.splice(index, 1)
                    }
                }
            }
        }
    }
    
    function convertTrackerProtocol(newTracker, port){
        let url = new URL(newTracker)
        if(url.protocol == 'http:'){
            url.protocol = 'ws:'
        } else
        if(url.protocol == 'https:'){
            url.protocol = 'wss:'
        }
        if(process.env.ENVIRONMENT == 'production' || process.env.NODE_ENV == 'production'){
            url.port = ''
        } else {
            url.port = port
        }
        return url.origin
    }
    
}