'use strict';

const config = require('../config');
const db = require('./redis-clients').users;
const fs = require('fs');
const Primus = require('primus');
const primusemitter = require('primus-emitter');
const primusrooms = require('primus-rooms');
const rooms = require('./rooms').rooms;
const uglify = require('uglify-js');
const utils = require('./utils');

const banDuration = utils.banDuration;
const isFunction = utils.isFunction;
const isString = utils.isString;
const sparks = Object.create(null); // Sparks of all rooms
let primus;
let sessionstore;

/**
 * Expose a function to set up Primus.
 */

module.exports = function(options) {
  sessionstore = options.sessionstore;

  // Create Primus instance
  primus = new Primus(options.server, {
    authorization: authorize,
    maxLength: 1024,
    plugin: {
      emitter: primusemitter,
      rooms: primusrooms
    },
    rooms: { wildcard: false },
    transformer: 'websockets'
  });

  // Remove unneeded middleware
  ['cors', 'no-cache', 'primus.js', 'spec', 'x-xss'].forEach(function(
    middleware
  ) {
    primus.remove(middleware);
  });

  // Add cookieParser middleware
  primus.use('cookies', options.parser, 0);

  primus.on('connection', connection);
  primus.on('joinroom', joinRoom);
  primus.on('log', function(type) {
    if (type === 'error') {
      const err = arguments[1];
      console.error(err.stack || err.message);
    }
  });

  // Minify and store the client-side library in the public directory
  const library = uglify.minify(primus.library());
  fs.writeFileSync(__dirname + '/../public/js/primus.min.js', library.code);

  return { primus: primus, sparks: sparks };
};

/**
 * Authorization handler.
 */

function authorize(req, authorized) {
  const cookies = req.signedCookies;
  if (!cookies['connect.sid']) {
    const err = new Error('connect.sid cookie not transmitted');
    console.error(err.message);
    return authorized(err);
  }
  sessionstore.get(cookies['connect.sid'], function(err, session) {
    if (err || !session) {
      err = err || new Error('session not found');
      console.error(err.message);
      return authorized(err);
    }
    db.exists(['ban:' + req.forwarded.ip], function(err, exists) {
      if (err) {
        console.error(err.message);
        return authorized(err);
      }
      if (exists) {
        return authorized(new Error('banned IP address'));
      }
      req.user = session.user;
      authorized();
    });
  });
}

/**
 * Handle `connection` event.
 */

function connection(spark) {
  const nickname = spark.request.cookies.nickname;
  const user = spark.request.user;
  const room = spark.query.room;

  spark.send(
    'overview',
    config.rooms.reduce(function(data, room) {
      data[room] = rooms[room].totusers;
      return data;
    }, {})
  );

  if (!~config.rooms.indexOf(room)) return;

  if (user) {
    if (sparks[user]) {
      // User already in a room
      spark.send('alreadyinaroom');
    } else {
      spark.nickname = user;
      spark.join(room, function() {
        rooms[room].addUser(spark, true);
      });
    }
  } else {
    if (isString(nickname)) {
      rooms[room].join(spark, nickname);
    } else {
      spark.send('nickname');
    }

    spark.on('nickname', function(nickname) {
      if (isString(nickname)) {
        rooms[room].join(spark, nickname);
      }
    });
  }
}

/**
 * Handle `joinroom` event.
 */

function joinRoom(room, spark) {
  room = rooms[room];
  spark.on('ban', function(who, why, duration, callback) {
    if (
      isString(who) &&
      isString(why) &&
      isString(duration) &&
      isFunction(callback)
    ) {
      room.onKick(who, why, spark.nickname, banDuration(duration), callback);
    }
  });
  spark.on('chatmsg', function(msg, to) {
    if (isString(msg)) {
      room.onChatMessage(msg, spark, to);
    }
  });
  spark.on('guess', function(guess) {
    if (isString(guess)) {
      room.onGuess(spark, guess);
    }
  });
  spark.on('ignore', function(who, callback) {
    if (isString(who) && isFunction(callback)) {
      room.onIgnore(who, spark.nickname, callback);
    }
  });
  spark.on('kick', function(who, why, callback) {
    if (isString(who) && isString(why) && isFunction(callback)) {
      room.onKick(who, why, spark.nickname, callback);
    }
  });
  spark.on('leaveallrooms', function() {
    room.removeUser(spark.nickname);
  });
  spark.on('unban', function(ip, callback) {
    if (isString(ip) && isFunction(callback)) {
      utils.unban(ip, spark, callback);
    }
  });
  spark.on('unignore', function(who) {
    if (isString(who)) {
      room.onUnignore(who, spark.nickname);
    }
  });
}
