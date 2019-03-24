'use strict';

const db = require('./redis-clients').users;

/**
 * Convert the duration of a ban from minutes to seconds and return the value.
 * Default duration is 15 minutes.
 */

exports.banDuration = function(str) {
  return /^[1-9][0-9]*$/.test(str) ? str * 60 : 900;
};

/**
 * Helper function used to build leaderboards.
 * Rearrange database results in an object.
 */

exports.buildLeaderboards = function(pointsresults, timesresults) {
  const obj = {
    pointsleaderboard: [],
    timesleaderboard: []
  };
  for (let i = 0; i < pointsresults.length; i += 2) {
    obj.pointsleaderboard.push({
      username: pointsresults[i],
      totpoints: pointsresults[i + 1]
    });
    obj.timesleaderboard.push({
      username: timesresults[i],
      bestguesstime: (timesresults[i + 1] / 1000).toFixed(2)
    });
  }
  return obj;
};

/**
 * Return the string representation of a given date in the 'DD/MM/YYYY' format.
 */

exports.britishFormat = function(date) {
  let day = date.getDate();
  let month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (day < 10) {
    day = '0' + day;
  }
  if (month < 10) {
    month = '0' + month;
  }
  return day + '/' + month + '/' + year;
};

/**
 * Check whether a given string is a valid email address.
 */

exports.isEmail = function(str) {
  // Simple filter, but it covers most of the use cases.
  const filter = /^[+a-zA-Z0-9_.-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z0-9]{2,6}$/;
  return filter.test(str);
};

/**
 * Check whether the given argument is a function.
 */

exports.isFunction = function(arg) {
  return typeof arg === 'function';
};

/**
 * Check whether the given argument is a string.
 */

exports.isString = function(arg) {
  return typeof arg === 'string';
};

/**
 * Check whether a given string is a well formed username.
 */

exports.isUsername = function(str) {
  const filter = /^[a-zA-Z0-9\-_]{1,15}$/;
  return filter.test(str);
};

/**
 * Get a random slogan.
 */

exports.randomSlogan = function() {
  const slogans = ['guess the song.', 'name that tune.', 'i know this track.'];
  return slogans[Math.floor(Math.random() * slogans.length)];
};

/**
 * Return the sorting parameters used to get users ordered by best guess time.
 */

exports.sortParams = function(offset) {
  const params = [
    'users',
    'by',
    'user:*->bestguesstime',
    'get',
    '#',
    'get',
    'user:*->bestguesstime',
    'limit',
    offset,
    '30'
  ];
  return params;
};

/**
 * Handle `unban` command.
 */

exports.unban = function(ip, spark, callback) {
  const issuedby = spark.nickname;

  db.hget(['user:' + issuedby, 'role'], function(err, role) {
    if (err) {
      console.error(err.message);
      // Fail silently in case of error
      return callback(true);
    }

    if (role < 1) {
      return callback(false);
    }

    // At this point consider the command successfully executed
    callback(true);

    if (ip !== 'list') {
      return db.del('ban:' + ip);
    }

    // List all banned players
    db.keys(['ban:*'], function(err, replies) {
      if (err) {
        return console.error(err.message);
      }

      if (!replies.length) {
        spark.send('chatmsg', 'the ban list is empty.', 'binb', issuedby);
        return;
      }

      replies.forEach(function(key) {
        const bannedip = key.slice(4);
        db.get([key], function(err, reply) {
          if (err) {
            return console.error(err.message);
          }
          spark.send('chatmsg', bannedip + ' → ' + reply, 'binb', issuedby);
        });
      });
    });
  });
};
