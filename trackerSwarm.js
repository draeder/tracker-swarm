const hyperswarm = require('hyperswarm') // For encryption, use https://github.com/mafintosh/noise-network
const crypto = require('crypto')
const CryptoJS = require("crypto-js")
const UUID = require('uuid-1345')
const Server = require('bittorrent-tracker').Server
let { FakeBitTorrentClient } = require('fake-bittorrent-client')

module.exports = function start(swarmNodeHostname, opts){
    let trackers = []
    let port

    let appId = UUID.v5({
        namespace: UUID.namespace.url,
        name: opts.appName || 'universal-signal-swarm'
    })

    let protocol = 'ws'
    if(opts.tls == true){
        protocol = 'wss'
    }

    setInterval(()=>{
        testTracker(trackers, appId, port)
    }, 60000)

    // Hyperswarm
    const swarmNodeId = crypto.randomBytes(32).toString('hex')

    const swarm = hyperswarm()

    // look for peers listed under this topic
    const topic = crypto.createHash('sha256')
    .update(appId || 'universal-signal-swarm') // some topic to connect
    .digest()

    swarm.join(topic, {
        lookup: true, // find & connect to peers
        announce: true // optional- announce self as a connection target
    })

    swarm.on('connection', (socket, info) => {
        const {
            priority,
            status,
            retries,
            peer,
            client
        } = info

        if(client){
            socket.write(Buffer.from(JSON.stringify(trackers), 'utf8'))
        }

        socket.on("data", data => {
            
            let items = JSON.parse(data.toString())
            console.log(items)
            
            let tempTrackers = []
            for(tracker in trackers){
                let decrypted = decrypt(trackers[tracker], appId)
                tempTrackers.push(decrypted)
            }
            for(item in items){
                let decrypted = decrypt(items[item], appId)
                let found = tempTrackers.includes(decrypted)
                if(!found){
                    trackers.push(items[item])
                    testTracker(trackers, appId, port)
                }
            }
        })

        socket.on('close', data => {
            if(client){
                testTracker(trackers, appId, port)
                socket.write(Buffer.from(JSON.stringify(trackers), 'utf8'))
            }
        })
    })

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
        if(req.url == '/trackers'){
            res.writeHead(200, headers);
            res.end(JSON.stringify({"appName": opts.appName || 'universal-signal-swarm', "trackers": trackers}))
        } else {
            res.end('')
        }
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
        console.log(`Signal-swarm server listening on ws port: ${server.ws.address().port}`)
        let trackerServer = `${protocol}://${swarmNodeHostname ? swarmNodeHostname : '0.0.0.0'}:${port}`

        let ciphertext = CryptoJS.AES.encrypt(trackerServer, appId).toString()
        trackers.push(ciphertext)
        testTracker(trackers, appId, port)
    })

    // start tracker server listening! Use 0 to listen on a random free port.
    server.listen(opts.port || 0)

}

function testTracker(trackers, appId, port){

    for(tracker in trackers){
        let encryptedTrackerServer = trackers[tracker]
        //let bites = CryptoJS.AES.decrypt(encryptedTrackerServer, appId)
        //let trackerServer = bites.toString(CryptoJS.enc.Utf8)

        let trackerServer = decrypt(trackers[tracker], appId)
    
        let trackerUrl = new URL(trackerServer)
        if(trackerUrl.port==''){
            trackerUrl.port = port
            //trackerUrl = `https://${trackerUrl.host}${port}`
        }
    
        if(trackerUrl.protocol == 'ws:'){
            trackerUrl = `http://${trackerUrl.host}`
        } else
        if(trackerUrl.protocol == 'wss:'){
            trackerUrl = `https://${trackerUrl.host}`
        } else {
            return console.error(`Error: unsupported tracker protocol: ${trackerUrl.protocol}`)
        }

        const torrentHash = crypto.randomBytes(20).toString('hex')
        const options = {
            peerId: '-DE13F0-ABCDEF', // Deluge 1.3.15
            port: 31452, // Listen port ( for fake, API will never open a port )
            timeout: 1500, // Optional
            uploaded: 1024 * 16, // Optional, data "already" uploaded
            downloaded: 1024 * 16 // Optinal, data "already" downloaded
        }
    
        const client = new FakeBitTorrentClient(trackerUrl, torrentHash, options)
    
        const bytes = 1024 * 1024 * 32 // 32 MB
        
        client
        .upload(bytes)
        .then(() => {
            checkDownload(client)
        })
        .catch(err => {
            console.error(`Error: ${trackerServer} is not a working tracker server, removing from signal-swarm. Please make sure the protocol, hostname and port is correct.`)
            badTracker(trackerServer)
        })
    
        function checkDownload(client){
            client
            .download(bytes)
            .then(() => {
                goodTracker(trackerServer)
            })
            .catch(err => {
                console.error(`Error: ${trackerServer} is not a working tracker server, removing from signal-swarm. Please make sure the protocol, hostname and port is correct.`)
                badTracker(trackerServer)
            })
        }
    
        function goodTracker(trackerServer){
            // not used at this time
        }
    
        function badTracker(trackerServer) {
            var index = trackers.indexOf(encryptedTrackerServer)
            if (index !== -1) {
                trackers.splice(index, 1)
            }
        }
    }
}

function decrypt(item, appId){
    let encryptedTrackerServer = item
    let bytes = CryptoJS.AES.decrypt(encryptedTrackerServer, appId)
    let trackerServer = bytes.toString(CryptoJS.enc.Utf8)
    return trackerServer
}