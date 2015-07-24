'use strict';

/**
 * Expose the constructor.
 */

module.exports = function(username, email, salt, hash, joindate) {
  this.username = username;
  this.email = email;
  this.salt = salt;
  this.password = hash;
  this.joindate = joindate;
  this.totpoints = 0;
  this.bestscore = 0;
  this.golds = 0;
  this.silvers = 0;
  this.bronzes = 0;
  this.bestguesstime = 30000;
  this.worstguesstime = 0;
  this.totguesstime = 0;
  this.guessed = 0;
  this.victories = 0;
  this.secondplaces = 0;
  this.thirdplaces = 0;
};
