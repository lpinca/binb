/**
 * Module dependencies.
 */

var db = require('./redis-clients').users;

/**
 * Expose a function to collect user statistics.
 */

module.exports = function(username, stats) {
  var key = 'user:'+username;
  if (stats.points) {
    // Update total points
    db.hincrby(key, 'totpoints', stats.points);
    // Update the score of the member in the sorted set
    db.zincrby('users', stats.points, username);
  }
  if (stats.userscore) {
    // Set personal best
    db.hget(key, 'bestscore', function(err, res) {
      if (res < stats.userscore) {
        db.hset(key, 'bestscore', stats.userscore);
      }
    });
  }
  if (stats.gold) {
    // Update the number of golds
    db.hincrby(key, 'golds', 1);
  }
  if (stats.silver) {
    db.hincrby(key, 'silvers', 1);
  }
  if (stats.bronze) {
    db.hincrby(key, 'bronzes', 1);
  }
  if (stats.guesstime) {
    // Update the number of guessed tracks
    db.hincrby(key, 'guessed', 1);
    // Update total guess time
    db.hincrby(key, 'totguesstime', stats.guesstime);
    // Set best answer time
    db.hget(key, 'bestguesstime', function(err, res) {
      if (stats.guesstime < res) {
        db.hset(key, 'bestguesstime', stats.guesstime);
      }
    });
    // Set worst answer time
    db.hget(key, 'worstguesstime', function(err, res) {
      if (stats.guesstime > res) {
        db.hset(key, 'worstguesstime', stats.guesstime);
      }
    });
  }
  if (stats.firstplace) {
    // Update the number of first places
    db.hincrby(key, 'victories', 1);
  }
  if (stats.secondplace) {
    db.hincrby(key, 'secondplaces', 1);
  }
  if (stats.thirdplace) {
    db.hincrby(key, 'thirdplaces', 1);
  }
};
