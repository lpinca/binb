/**
 * Module dependencies.
 */

var db = require('../redis-clients').users
  , forwarded = require('forwarded-for')
  , utils = require('../utils');

/**
 * Expose a middleware to filter banned IPs.
 */

module.exports = function(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache');

  var address = forwarded(req, req.headers);

  db.ttl(['ban:' + address.ip], function(err, ttl) {
    if (err) {
      return next(err);
    }

    if (ttl < 0) {
      return next();
    }

    res.render('banned', {
      slogan: utils.randomSlogan(),
      ttl: Math.round(ttl / 60)
    });
  });
};
