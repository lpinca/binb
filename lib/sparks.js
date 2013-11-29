/**
 * Module dependencies.
 */

var config = require('../config')
  , fs = require('fs')
  , minify = require('uglify-js').minify
  , parseCookie = require('express/node_modules/cookie').parse
  , parseSignedCookies = require('express/node_modules/connect').utils.parseSignedCookies
  , Primus = require('primus')
  , primus
  , primusemitter = require('primus-emitter')
  , primusrooms = require('primus-rooms')
  , rooms = require('./rooms').rooms
  , secret
  , sessionstore
  , sparks = Object.create(null); // Sparks of all rooms

/**
 * Expose a function to set up Primus.
 */

module.exports = function(options) {
  secret = options.secret;
  sessionstore = options.sessionstore;

  // Create Primus instance
  primus = new Primus(options.server, {
    authorization: authorize,
    plugin: {
      emitter: primusemitter,
      rooms: primusrooms
    },
    transformer: 'websockets'
  });
  
  // Minify and store the client-side library in the public directory
  var library = minify(primus.library(), {fromString: true});
  fs.writeFileSync(__dirname + '/../public/js/primus.min.js', library.code);

  primus.on('connection', connection);
  primus.on('log', function(type, message, context) {
    if (type === 'error') {
      console.error(context.stack);
    }
  });
  return {primus: primus, sparks: sparks};
};

/**
 * Authorization handler.
 */

var authorize = function(req, authorized) {
  var cookie = req.headers.cookie;
  if(!cookie) {
    var err = new Error('no cookie transmitted');
    console.error(err.stack);
    return authorized(err);
  }
  cookie = parseCookie(cookie);
  cookie = parseSignedCookies(cookie, secret);
  sessionstore.get(cookie['connect.sid'], function(err, session) {
    if (err || !session) {
      err = err || new Error('session not found');
      console.error(err.stack);
      return authorized(err);
    }
    req.headers.session = session;
    authorized();
  });
};

/**
 * Handle `connection` event.
 */

var connection = function(spark) {
  var room
    , user = spark.headers.session.user;
  delete spark.headers.session;
  spark.on('end', function() {
    if (room) {
      rooms[room].removeUser(spark.nickname);
    }
  });
  spark.on('getoverview', function(callback) {
    if (typeof callback !== 'function') {
      return;
    }
    var data = Object.create(null);
    for (var room in rooms) {
      data[room] = rooms[room].getPopulation();
    }
    callback(data);
  });
  spark.on('getstatus', function(callback) {
    if (room && typeof callback === 'function') {
      rooms[room].sendStatus(callback);
    }
  });
  spark.on('guess', function(guess) {
    if (room && typeof guess === 'string') {
      rooms[room].guess(spark, guess);
    }
  });
  spark.on('ignore', function(who, callback) {
    if (room && typeof who === 'string' && typeof callback === 'function') {
      rooms[room].ignore(who, spark.nickname, callback);
    }
  });
  spark.on('joinanonymous', function(nickname, room) {
    if (!spark.nickname && typeof nickname === 'string' && ~config.rooms.indexOf(room)) {
      rooms[room].setNickName(spark, nickname);
    }
  });
  spark.on('joinauthenticated', function(room) {
    if (user && ~config.rooms.indexOf(room)) {
      if (sparks[user]) { // User already in a room
        return spark.send('alreadyinaroom');
      }
      spark.nickname = user;
      rooms[room].joinRoom(spark);
    }
  });
  spark.on('joinroom', function(roomname) {
    room = roomname;
  });
  spark.on('kick', function(who, why, callback) {
    if (room && typeof who === 'string' && typeof why === 'string' &&
      typeof callback === 'function') {
      rooms[room].kick(who, why, spark.nickname, callback);
    }
  });
  spark.on('loggedin', function(callback) {
    if (typeof callback !== 'function') {
      return;
    }
    return user ? callback(true, user) : callback(false);
  });
  spark.on('sendchatmsg', function(msg, to) {
    if (room && typeof msg === 'string') {
      rooms[room].sendChatMessage(msg, spark, to);
    }
  });
  spark.on('unignore', function(who) {
    if (room && typeof who === 'string') {
      rooms[room].unignore(who, spark.nickname);
    }
  });
};
