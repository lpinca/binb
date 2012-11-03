/**
 * Module dependencies.
 */

var redisurl = require('redis-url');

/**
 * Setting up redis clients.
 */

var songsclient = redisurl.createClient(process.env.SONGS_DB_URL)
    , usersclient = redisurl.createClient(process.env.USERS_DB_URL);

songsclient.on('error', function(err) {
    console.log(err.message);
});

usersclient.on('error', function(err) {
    console.log(err.message);
});

/**
 * Expose the clients
 */

exports.songs = songsclient;
exports.users = usersclient;
