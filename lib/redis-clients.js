'use strict';

const redis = require('redis');

/**
 * Setting up redis clients.
 */

const songsclient = redis.createClient({ auth_pass: process.env.DB_AUTH });
const usersclient = redis.createClient({ auth_pass: process.env.DB_AUTH });

songsclient.on('error', function(err) {
  console.error(err.message);
});

usersclient.on('error', function(err) {
  console.error(err.message);
});

usersclient.select(1);

/**
 * Expose the clients
 */

exports.songs = songsclient;
exports.users = usersclient;
