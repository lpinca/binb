/**
 * Module dependencies.
 */

var async = require('async')
  , Captcha = require('../lib/captcha')
  , db = require('../lib/redis-clients').songs
  , randInt = require('../lib/prng').randInt
  , rooms = require('../config').rooms
  , utils = require('../lib/utils')
  , randomSlogan = utils.randomSlogan
  , trackscount = utils.trackscount;

/**
 * Generate a sub-task.
 */

var subTask = function(genre) {
  return function(callback) {
    var index = randInt(trackscount[genre]);
    db.zrange(genre, index, index, function(err, res) {
      db.hget('song:'+res[0], 'artworkUrl100', callback);
    });
  };
};

/**
 * Extract at random in each room, some album covers and return the result as a JSON.
 */

exports.artworks = function(req, res) {
  var tasks = {};
  rooms.forEach(function(room) {
    tasks[room] = function(callback) {
      var subtasks = [];
      for (var i = 0; i < 6; i++) {
        subtasks.push(subTask(room));
      }
      async.parallel(subtasks, callback);
    };
  });
  async.parallel(tasks, function(err, results) {
    res.json(results);
  });
};

exports.changePasswd = function(req, res) {
  if (!req.session.user) {
    return res.redirect('/login?followup=/changepasswd');
  }
  res.render('changepasswd', {
    followup: req.query.followup || '/',
    loggedin: req.session.user,
    slogan: randomSlogan()
  });
};

exports.home = function(req, res) {
  res.render('home', {
    loggedin: req.session.user,
    rooms: rooms,
    slogan: randomSlogan()
  });
};

exports.login = function(req, res) {
  res.render('login', {
    followup: req.query.followup || '/',
    slogan: randomSlogan()
  });
};

exports.recoverPasswd = function(req, res) {
  var captcha = new Captcha();
  req.session.captchacode = captcha.getCode();
  res.render('recoverpasswd', {
    captchaurl: captcha.toDataURL(),
    followup: req.query.followup || '/',
    slogan: randomSlogan()
  });
};

exports.resetPasswd = function(req, res) {
  res.render('resetpasswd', {
    slogan: randomSlogan(),
    token: req.query.token || ''
  });
};

exports.room = function(req, res) {
  if (~rooms.indexOf(req.params.room)) {
    return res.render('room', {
      loggedin: req.session.user,
      roomname: req.params.room,
      rooms: rooms,
      slogan: randomSlogan()
    });
  }
  res.send(404);
};

exports.signup = function(req, res) {
  var captcha = new Captcha();
  req.session.captchacode = captcha.getCode();
  res.render('signup', {
    captchaurl: captcha.toDataURL(),
    followup: req.query.followup || '/',
    slogan: randomSlogan()
  });
};

/**
 * Report errors during form submission.
 */

exports.validationErrors = function(req, res, next) {
  res.locals.errors = req.session.errors;
  res.locals.oldvalues = req.session.oldvalues;
  delete req.session.errors;
  delete req.session.oldvalues;
  next();
};
