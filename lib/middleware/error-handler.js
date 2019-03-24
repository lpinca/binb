'use strict';

const http = require('http');

/**
 * Basic error handling middleware.
 */

module.exports = function(err, req, res, next) {
  console.error(err.message);
  res.status(500).send(http.STATUS_CODES[500]);
};
