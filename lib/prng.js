/**
 * Module dependencies.
 */

var crypto = require('crypto')
  , rrange = 4294967296;

/**
 * Return an integer, pseudo-random number in the range [0, 2^32).
 */

var nextInt = function() {
  return crypto.randomBytes(4).readUInt32BE(0);
};

/**
 * Return a floating-point, pseudo-random number in the range [0, 1).
 */

var rand = function() {
  return nextInt() / rrange;
};

/**
 * Return an integer, pseudo-random number in the range [0, max).
 */

exports.randInt = function(max) {
  return Math.floor(rand() * max);
};
