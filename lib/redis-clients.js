/**
 * Module dependencies.
 */

var redis = require('redis');

/**
 * Setting up redis clients.
 */

var songsclient = redis.createClient(
  process.env.SONGS_DB_PORT || 6379,
  process.env.SONGS_DB_HOST || '127.0.0.1'
);
var usersclient = redis.createClient(
  process.env.USERS_DB_PORT || 6379,
  process.env.USERS_DB_HOST || '127.0.0.1'
);

if (process.env.NODE_ENV === 'production') {
  songsclient.auth(process.env.SONGS_DB_AUTH);
  usersclient.auth(process.env.USERS_DB_AUTH);
}

songsclient.on('error', function(err) {
  console.error(err.message);
});

usersclient.on('error', function(err) {
  console.error(err.message);
});

/**
 * Expose the clients
 */

exports.songs = songsclient;
exports.users = usersclient;
