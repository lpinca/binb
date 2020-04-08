'use strict';

//Add environment vars or use standard values
var db = process.env.REDIS_URL || 'localhost'
var port = process.env.REDIS_PORT || 6379

const artistIds = require('./artist-ids');
const http = require('http');
const JSONStream = require('JSONStream');
const limit = 7; // The number of songs to retrieve for each artist
const parser = JSONStream.parse(['results', true]);
const popIds = artistIds.pop;
const rapIds = artistIds.nederlands;
const rc = require('redis').createClient({ host: db, port: port })
const rockIds = artistIds.rock;
let rooms = require('../config').rooms;
let score;
let skip = 0; // Skip counter
let songId = 0;

const options = {
  headers: { 'content-type': 'application/json' },
  host: 'itunes.apple.com',
  // Look up multiple artists by their IDs and get `limit` songs for each one
  path:
    '/lookup?id=' +
    popIds.concat(rapIds, rockIds).join() +
    '&entity=song&limit=' +
    limit + '&country=NL&sort=popular',
  port: 80
};

/**
 * Set the rooms in which the songs of a given artist will be loaded.
 */

const updateRooms = function(artistId) {
  rooms = ['mixed'];
  score = 0;
  if (artistId === popIds[0]) {
    rooms.push('hits', 'pop');
    // Set the skip counter (there is no need to update the rooms for the next pop artists)
    skip = popIds.length - 1;
  } else if (artistId === rapIds[0]) {
    rooms.push('nederlands', 'hits');
    skip = rapIds.length - 1;
  } else {
    rooms.push('oldies', 'rock');
    skip = rockIds.length - 1;
  }
};

parser.on('data', function(track) {
  if (track.wrapperType === 'artist') {
    console.log('\x1b[36m%s\x1b[0m', track.artistName);
    if (skip) {
      skip--;
      return;
    }
    updateRooms(track.artistId);
    return;
  }

  console.log(track.trackName);
  rc.hmset(
    'song:' + songId,
    'artistName',
    track.artistName,
    'trackName',
    track.trackName,
    'trackViewUrl',
    track.trackViewUrl,
    'previewUrl',
    track.previewUrl,
    'artworkUrl60',
    track.artworkUrl60,
    'artworkUrl100',
    track.artworkUrl100
  );

  rooms.forEach(function(room) {
    const _score = room === 'mixed' ? songId : score;
    rc.zadd(room, _score, songId);
  });

  score++;
  songId++;
});

parser.on('end', function() {
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
