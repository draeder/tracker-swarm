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

        socket.write(Buffer.from(JSON.stringify(trackers), 'utf8'))

        socket.on("data", data => {
            
            let items = JSON.parse(data.toString())
            
            let tempTrackers = []
            for(tracker in trackers){
                let decrypted = decrypt(trackers[tracker], appId)
                tempTrackers.push(decrypted)
            }
            for(item in items){
                let decrypted = decrypt(items[item], appId)
                //testTrackers(trackers, decrypted, items[item], appId)
                let found = tempTrackers.includes(decrypted)
                if(!found){
                    console.log("New tracker found...")
                    trackers.push(items[item])
                }
                else {
                    console.log("Tracker already exists, not adding.")
                }
            }
        })

        socket.on('close', data => {
            if(client){
                //testTracker(trackers, appId, port)
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
        port = process.env.PORT || server.ws.address().port
        console.log(`Signal-swarm server listening on ws port: ${port}`)

        let trackerServer = `${protocol}://${swarmNodeHostname ? swarmNodeHostname : '0.0.0.0'}:${port}`
        
        trackerServer = domainTester(trackerServer)

        let ciphertext = CryptoJS.AES.encrypt(trackerServer, appId).toString()
        trackers.push(ciphertext)
    })

    // start tracker server listening! Use 0 to listen on a random free port.
    server.listen(process.env.PORT || opts.port || 0)


    /*
    setInterval(()=>{
        for(tracker in trackers){
            let decrypted = decrypt(trackers[tracker], appId)
            testTrackers(trackers, decrypted, trackers[tracker], appId)
        }
    },60000)
    */

}

function domainTester(trackerServer){

    let trackerUrl = new URL(trackerServer)

    let domainTest = trackerUrl.hostname.split('.').slice(-2).join('.')

    if(domainTest == 'herokuapp.com' || domainTest == 'glitch.me'){
        trackerUrl.port = ''
        return trackerUrl.href
    }

    return trackerServer
    
}

function testTrackers(trackers, tracker, encrypted, appId, port){

    console.log(tracker)


    let trackerServer = tracker

    let trackerUrl = new URL(trackerServer)

    if(trackerUrl.port==''){
        trackerUrl.port = port
        //trackerUrl = `https://${trackerUrl.host}${port}`
    }
    if(trackerUrl.protocol == 'ws:'){
        url = `http://${trackerUrl.host}`
    } else
    if(trackerUrl.protocol == 'wss:'){
        url = `https://${trackerUrl.host}`
    } else {
        return console.error(`Error: unsupported tracker protocol: ${trackerUrl.protocol}`)
    }

    let domainTest = domainTester(url)

    if(domainTest == 'herokuapp.com'){
        trackerUrl.port = ''
        url = `https://${trackerUrl.hostname}`
    }

    console.log(url)

    const torrentHash = crypto.randomBytes(20).toString('hex')
    const options = {
        peerId: '-DE13F0-ABCDEF', // Deluge 1.3.15
        port: 31452, // Listen port ( for fake, API will never open a port )
        timeout: 1500, // Optional
        uploaded: 1024 * 16, // Optional, data "already" uploaded
        downloaded: 1024 * 16 // Optinal, data "already" downloaded
    }

    const client = new FakeBitTorrentClient(url, torrentHash, options)

    const bytes = 1024 * 1024 * 32 // 32 MB
    
    client
    .upload(bytes)
    .then(() => {
        checkDownload(client)
    })
    .catch(err => {
        badTracker(trackerServer)
    })

    function checkDownload(client){
        client
        .download(bytes)
        .then(() => {
            goodTracker(trackerServer)
        })
        .catch(err => {
            badTracker(trackerServer)
        })
    }

    function goodTracker(trackerServer){
        // not used at this time
        console.log(`${trackerServer} is a good tracker server`)
    }

    function badTracker(trackerServer) {
        console.error(`Error: ${trackerServer} is not a working tracker server, removing from signal-swarm. Please make sure the protocol, hostname and port is correct.`)
        var index = trackers.indexOf(encrypted)
        if (index !== -1) {
            trackers.splice(index, 1)
        }
    }
}

function decrypt(item, appId){
    let encryptedTrackerServer = item
    let bytes = CryptoJS.AES.decrypt(encryptedTrackerServer, appId)
    let trackerServer = bytes.toString(CryptoJS.enc.Utf8)
    return trackerServer
}