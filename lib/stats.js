'use strict';

const db = require('./redis-clients').users;

/**
 * Update user statistics.
 */

const updateStats = function(key, multi, username, stats) {
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
  if (stats.podiumplace) {
    switch (stats.podiumplace) {
      case 1:
        multi.hincrby(key, 'victories', 1);
        break;
      case 2:
        multi.hincrby(key, 'secondplaces', 1);
        break;
      case 3:
        multi.hincrby(key, 'thirdplaces', 1);
    }
  }
  multi.exec(function(err) {
    if (err) {
      console.error(err.message);
    }
  });
};

/**
 * Expose a function to update user statistics.
 */

module.exports = function(username, stats) {
  const key = 'user:' + username;
  const multi = db.multi();
  if (stats.guesstime) {
    const args = [
      key,
      'bestscore',
      'bestguesstime',
      'worstguesstime',
      'totguesstime',
      'guessed'
    ];
    db.hmget(args, function(err, replies) {
      if (err) {
        return console.error(err.message);
      }
      if (stats.guesstime < 1000) {
        stats.guesstime =
          replies[4] !== '0' ? Math.round(replies[3] / replies[4]) : 15000;
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
