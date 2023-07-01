'use strict';

const Redis = require('ioredis');

/**
 * Setting up redis clients.
 */

const songsclient = new Redis({ password: process.env.DB_AUTH });
const usersclient = new Redis({ db: 1, password: process.env.DB_AUTH });

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
