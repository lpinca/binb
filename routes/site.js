/**
 * Module dependencies.
 */

var async = require('async')
    , Captcha = require('../lib/captcha')
    , db
    , rooms;

/**
 * Generate a task for async.
 */

var task = function(genre) {
    return function(callback) {
        db.srandmember(genre, function(err, res) {
            db.hget('song:'+res, 'artworkUrl100', callback);
        });
    };
};

/**
 * Initialize dependencies.
 */

exports.use = function(options) {
    db = options.db;
    rooms = options.rooms;
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
    res.render('changepasswd', {followup:req.query['followup'],loggedin:req.session.user});
};

exports.index = function(req, res) {
    res.render('index', {loggedin:req.session.user,rooms:rooms});
};

exports.login = function(req, res) {
    res.render('login', {followup:req.query['followup']});
};

exports.room = function(req, res) {
    if (rooms.indexOf(req.params.room) !== -1) {
        res.render('room', {loggedin:req.session.user,roomname:req.params.room,rooms:rooms});
    }
    else {
        res.send(404);
    }
};

exports.signup = function(req, res) {
    var captcha = new Captcha();
    req.session.captchacode = captcha.getCode();
    res.render('signup', {captchaurl:captcha.toDataURL(),followup:req.query['followup']});
};
