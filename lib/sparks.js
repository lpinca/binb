/**
 * Module dependencies.
 */

var config = require('../config')
  , fs = require('fs')
  , minify = require('uglify-js').minify
  , Primus = require('primus')
  , primus
  , primusemitter = require('primus-emitter')
  , primusrooms = require('primus-rooms')
  , rooms = require('./rooms').rooms
  , sessionstore
  , sparks = Object.create(null) // Sparks of all rooms
  , utils = require('./utils')
  , isFunction = utils.isFunction
  , isString = utils.isString;

/**
 * Expose a function to set up Primus.
 */

module.exports = function(options) {
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

  // Remove unneeded middleware
  ['cors', 'primus.js', 'spec', 'no-cache'].forEach(function(middleware) {
    primus.remove(middleware);
  });

  // Add cookieParser middleware
  primus.before('cookies', options.parser, 0);

  primus.on('connection', connection);
  primus.on('joinroom', joinRoom);
  primus.on('leaveallrooms', function(rms, spark) {
    rms.forEach(function(room) {
      rooms[room].removeUser(spark.nickname);
    });
  });
  primus.on('log', function(type) {
    if (type === 'error') {
      var err = arguments[1];
      console.error(err.stack);
    }
  });

  // Minify and store the client-side library in the public directory
  var library = minify(primus.library(), {fromString: true});
  fs.writeFileSync(__dirname + '/../public/js/primus.min.js', library.code);

  return {primus: primus, sparks: sparks};
};

/**
 * Authorization handler.
 */

var authorize = function(req, authorized) {
  var cookies = req.signedCookies;
  if (!cookies.hasOwnProperty('connect.sid')) {
    var err = new Error('connect.sid cookie not transmitted');
    console.error(err.message);
    return authorized(err);
  }
  sessionstore.get(cookies['connect.sid'], function(err, session) {
    if (err || !session) {
      err = err || new Error('session not found');
      console.error(err.message);
      return authorized(err);
    }
    req.user = session.user;
    authorized();
  });
};

/**
 * Handle `connection` event.
 */

var connection = function(spark) {
  var user = spark.request.user;
  spark.on('getoverview', function(callback) {
    if (!isFunction(callback)) {
      return;
    }
    var data = Object.create(null);
    for (var room in rooms) {
      data[room] = rooms[room].getPopulation();
    }
    callback(data);
  });
  spark.on('joinanonymous', function(nickname, room) {
    if (!spark.nickname && isString(nickname) && ~config.rooms.indexOf(room)) {
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
  spark.on('loggedin', function(callback) {
    if (!isFunction(callback)) {
      return;
    }
    return user ? callback(true, user) : callback(false);
  });
};

/**
 * Handle `joinroom` event.
 */

var joinRoom = function(room, spark) {
  spark.on('getstatus', function(callback) {
    if (isFunction(callback)) {
      rooms[room].sendStatus(callback);
    }
  });
  spark.on('guess', function(guess) {
    if (isString(guess)) {
      rooms[room].guess(spark, guess);
    }
  });
  spark.on('ignore', function(who, callback) {
    if (isString(who) && isFunction(callback)) {
      rooms[room].ignore(who, spark.nickname, callback);
    }
  });
  spark.on('kick', function(who, why, callback) {
    if (isString(who) && isString(why) && isFunction(callback)) {
      rooms[room].kick(who, why, spark.nickname, callback);
    }
  });
  spark.on('sendchatmsg', function(msg, to) {
    if (isString(msg)) {
      rooms[room].sendChatMessage(msg, spark, to);
    }
  });
  spark.on('unignore', function(who) {
    if (isString(who)) {
      rooms[room].unignore(who, spark.nickname);
    }
  });
};
