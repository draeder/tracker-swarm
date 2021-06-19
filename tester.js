let { FakeBitTorrentClient } = require('fake-bittorrent-client')
const trackerUrl = 'https://screeching-cautious-cart.glitch.me/';
const torrentHash = 'ee8d8728f435fd550f83852aabab5234ce1da528';
const options = {
  peerId: '-DE13F0-ABCDEF', // Deluge 1.3.15
  port: 31452, // Listen port ( for fake, API will never open a port )
  timeout: 1500, // Optional
  uploaded: 1024 * 16, // Optional, data "already" uploaded
  downloaded: 1024 * 16 // Optinal, data "already" downloaded
};

const client = new FakeBitTorrentClient(trackerUrl, torrentHash, options);

const bytes = 1024 * 1024 * 32; // 32 MB

client
  .upload(bytes)
  .then(() => console.log(['Uploaded ', bytes, ' bytes to ', trackerUrl].join('')))
  .catch(err => console.error(['Error : ', err].join('')));

client
  .download(bytes)
  .then(() => console.log(['Downloaded ', bytes, ' bytes from ', trackerUrl].join('')))
  .catch(err => console.error(['Error : ', err].join('')));