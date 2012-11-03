/**
 * Module dependencies.
 */

var async = require('async')
    , Captcha = require('../lib/captcha')
    , db = require('../lib/redis-clients').songs
    , randomSlogan = require('../lib/utils').randomSlogan
    , rooms = require('../config').rooms;

/**
 * Generate a task.
 */

var task = function(genre) {
    return function(callback) {
        db.srandmember(genre, function(err, res) {
            db.hget('song:'+res, 'artworkUrl100', callback);
        });
    };
};

/**
 * Extract at random in each room, some album covers and return the result as a JSON.
 */

exports.artworks = function(req, res) {
    var tasks = [];
    for (var i=0; i<rooms.length; i++) {
        for (var j=0; j<6; j++) {
            tasks.push(task(rooms[i]));
        }
    }
    async.parallel(tasks, function(err, results) {
        var obj = {
            resultCount: results.length,
            results: results
        };
        res.json(obj);
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
