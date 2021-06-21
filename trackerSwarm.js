const hyperswarm = require('hyperswarm') // For encryption, use https://github.com/mafintosh/noise-network
const crypto = require('crypto')
const CryptoJS = require("crypto-js")
const UUID = require('uuid-1345')
const Server = require('bittorrent-tracker').Server
const fetch = require('node-fetch')

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
                    testTrackers(trackers, decrypted, items[item], appId, port)
                }
            }
        })

        socket.on('close', data => {
            if(!client){
                console.log('disconnected')
                for(tracker in trackers){
                    let decrypted = decrypt(trackers[tracker], appId)
                    testTrackers(trackers, decrypted, trackers[tracker], appId, port)
                }
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

    setInterval(()=>{
        for(tracker in trackers){
            let decrypted = decrypt(trackers[tracker], appId)
            testTrackers(trackers, decrypted, trackers[tracker], appId, port)
        }
    },60000)

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
    

    let trackerServer = tracker

    let trackerUrl = new URL(trackerServer)
    let url

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

    tracker = domainTester(url)

    let peerId = '-DE13F0-' + crypto.randomBytes(6).toString('hex')
    let hash = crypto.randomBytes(20).toString('hex')
    let uploaded = 1024 * 16
    let downloaded = 1024 * 16
    let trackerTestUrl = [
        tracker,
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
            badTracker(trackerServer)
        } else {
            goodTracker(trackerServer)
        }
        return res.text()
    })
    .catch(err => {
        badTracker(trackerServer, err.code)
    })

    function goodTracker(trackerServer){
        //console.info(`Info: ${trackerServer} is a working tracker server, adding to signal-swarm.`)
    }

    function badTracker(trackerServer, errorCode) {
        console.error(`Error: ${errorCode ? errorCode : ''} - ${trackerServer} is not a working tracker server, removing from signal-swarm.`)
        var index = trackers.indexOf(encrypted)
        if (index !== -1) {
            trackers.splice(index, 1)
        }
    }
    
    function encodeURI(hash) {
        return hash.replace(/.{2}/g, function (m) {
            var v = parseInt(m, 16)
            if (v <= 127) {
                m = encodeURIComponent(String.fromCharCode(v))
                if (m[0] === '%') {
                    m = m.toLowerCase()
                }
            }
            else {
                m = '%' + m
            }
            return m
        })
    }
    
}


function decrypt(item, appId){
    let encryptedTrackerServer = item
    let bytes = CryptoJS.AES.decrypt(encryptedTrackerServer, appId)
    let trackerServer = bytes.toString(CryptoJS.enc.Utf8)
    return trackerServer
}