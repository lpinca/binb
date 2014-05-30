/**
 * Basic error handling middleware.
 */

module.exports = function(err, req, res, next) {
  if (Array.isArray(err)) {
    err.forEach(function(err) {
      console.error(err.message);
    });
  }
  else {
    console.error(err.message);
  }
  res.send(500);
};
