/**
 * Module dependencies.
 */

var redis = require('redis');

/**
 * Setting up redis clients.
 */

var songsclient = redis.createClient(process.env.SONGS_DB_PORT, process.env.SONGS_DB_HOST)
    , usersclient = redis.createClient(process.env.USERS_DB_PORT, process.env.USERS_DB_HOST);

if (process.env.NODE_ENV === 'production') {
    songsclient.auth(process.env.SONGS_DB_AUTH);
    usersclient.auth(process.env.USERS_DB_AUTH);
}

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
