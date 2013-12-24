/**
 * Module dependencies.
 */

var db = require('./redis-clients').users;

/**
 * Update user statistics.
 */

var updateStats = function(key, multi, username, stats) {
  if (stats.points) {
    // Update total points
    multi.hincrby(key, 'totpoints', stats.points);
    // Update the score of the member in the sorted set
    multi.zincrby('users', stats.points, username);
  }
  if (stats.gold) {
    // Update the number of golds
    multi.hincrby(key, 'golds', 1);
  }
  if (stats.silver) {
    multi.hincrby(key, 'silvers', 1);
  }
  if (stats.bronze) {
    multi.hincrby(key, 'bronzes', 1);
  }
  if (stats.firstplace) {
    // Update the number of first places
    multi.hincrby(key, 'victories', 1);
  }
  if (stats.secondplace) {
    multi.hincrby(key, 'secondplaces', 1);
  }
  if (stats.thirdplace) {
    multi.hincrby(key, 'thirdplaces', 1);
  }
  multi.exec(function(err, replies) {
    if (err) {
      err.forEach(function(err) {
        console.error(err.message);
      });
    }
  });
};

/**
 * Expose a function to update user statistics.
 */

module.exports = function(username, stats) {
  var key = 'user:' + username
    , multi = db.multi();
  if (stats.guesstime) {
    var args = [
      key
      , 'bestscore'
      , 'bestguesstime'
      , 'worstguesstime'
    ];
    db.hmget(args, function(err, replies) {
      if (err) {
        return console.error(err.message);
      }
      if (stats.userscore > replies[0]) {
        // Set personal best
        multi.hset(key, 'bestscore', stats.userscore);
      }
      // Update the number of guessed tracks
      multi.hincrby(key, 'guessed', 1);
      // Update total guess time
      multi.hincrby(key, 'totguesstime', stats.guesstime);
      // Set best answer time
      if (stats.guesstime < replies[1]) {
        multi.hset(key, 'bestguesstime', stats.guesstime);
      }
      // Set worst answer time
      if (stats.guesstime > replies[2]) {
        multi.hset(key, 'worstguesstime', stats.guesstime);
      }
      updateStats(key, multi, username, stats);
    });
    return;
  }
  if (stats.userscore) {
    db.hget([key, 'bestscore'], function(err, bestscore) {
      if (err) {
        return console.error(err.message);
      }
      if (stats.userscore > bestscore) {
        multi.hset(key, 'bestscore', stats.userscore);
      }
      updateStats(key, multi, username, stats);
    });
    return;
  }
  updateStats(key, multi, username, stats);
};
