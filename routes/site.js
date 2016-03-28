'use strict';

/**
 * Module dependencies.
 */

var async = require('async')
  , Captcha = require('../lib/captcha')
  , config = require('../config')
  , db = require('../lib/redis-clients').songs
  , http = require('http')
  , randInt = require('../lib/prng').randInt
  , randomSlogan = require('../lib/utils').randomSlogan
  , rooms = require('../lib/rooms').rooms;

/**
 * Generate a sub-task.
 */

var subTask = function(genre) {
  return function(callback) {
    var index = randInt(rooms[genre].trackscount);
    db.zrange([genre, index, index], function(err, res) {
      if (err) {
        return callback(err);
      }
      db.hget(['song:' + res[0], 'artworkUrl100'], callback);
    });
  };
};

/**
 * Extract at random in each room, some album covers and return the result as a JSON.
 */

exports.artworks = function(req, res, next) {
  var tasks = {};
  config.rooms.forEach(function(room) {
    tasks[room] = function(callback) {
      var subtasks = [];
      for (var i = 0; i < 6; i++) {
        subtasks.push(subTask(room));
      }
      async.parallel(subtasks, callback);
    };
  });
  async.parallel(tasks, function(err, results) {
    if (err) {
      return next(err);
    }
    res.send(results);
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
    rooms: config.rooms.map(function(room) {
      return { name: room, players: rooms[room].totusers };
    }),
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
  var stations = config.rooms.filter(function(room) {
    return room !== req.params.room;
  });

  if (stations.length === config.rooms.length) {
    return res.status(404).send(http.STATUS_CODES[404]);
  }

  res.render('room', {
    loggedin: req.session.user,
    roomname: req.params.room,
    rooms: stations.map(function(room) {
      return { name: room, players: rooms[room].totusers };
    }),
    slogan: randomSlogan()
  });
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
