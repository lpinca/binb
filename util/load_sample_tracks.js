/**
 * Module dependencies.
 */

var artistIds = require('./artist-ids')
  , http = require('http')
  , JSONStream = require('JSONStream')
  , limit = 7 // The number of songs to retrieve for each artist
  , parser = JSONStream.parse(['results', true])
  , popIds = artistIds.pop
  , rapIds = artistIds.rap
  , rc = require('redis').createClient()
  , rockIds = artistIds.rock
  , rooms = require('../config').rooms
  , score
  , skip = 0 // Skip counter
  , songId = 0;

var options = {
  headers: {'content-type': 'application/json'},
  host: 'itunes.apple.com',
  // Look up multiple artists by their IDs and get `limit` songs for each one
  path: '/lookup?id='+popIds.concat(rapIds, rockIds).join()+'&entity=song&limit='+limit,
  port: 80
};

/**
 * Set the rooms in which the songs of a given artist will be loaded.
 */

var updateRooms = function(artistId) {
  rooms = ['mixed'];
  score = 0;
  if (artistId === popIds[0]) {
    rooms.push('hits', 'pop');
    // Set the skip counter (there is no need to update the rooms for the next pop artists)
    skip = popIds.length - 1;
  }
  else if (artistId === rapIds[0]) {
    rooms.push('rap');
    skip = rapIds.length - 1;
  }
  else {
    rooms.push('oldies', 'rock');
    skip = rockIds.length - 1;
  }
};

parser.on('data', function(track) {
  if (track.wrapperType === 'artist') {
    if (skip) {
      skip--;
      return;
    }
    updateRooms(track.artistId);
    return;
  }

  rc.hmset('song:'+songId,
    'artistName', track.artistName,
    'trackName', track.trackName,
    'trackViewUrl', track.trackViewUrl,
    'previewUrl', track.previewUrl,
    'artworkUrl60', track.artworkUrl60,
    'artworkUrl100', track.artworkUrl100
  );

  rooms.forEach(function(room) {
    var _score = (room === 'mixed') ? songId : score;
    rc.zadd(room, _score, songId);
  });

  score++;
  songId++;
});

parser.on('root', function() {
  rc.quit();
  process.stdout.write('OK\n');
});

rc.del(rooms, function(err) {
  if (err) {
    throw err;
  }
  process.stdout.write('Loading sample tracks... ');
  http.get(options, function(res) {
    res.pipe(parser);
  });
});
