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

exports.index = function(req, res) {
    if (req.session.user) {
        res.local('loggedin', req.session.user);
    }
    res.render('index', {rooms:rooms});
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

exports.login = function(req, res) {
    res.render('login');
};

exports.signup = function(req, res) {
    var captcha = new Captcha();
    req.session.captchacode = captcha.getCode();
    res.render('signup', {captchaurl:captcha.toDataURL()});
};


exports.room = function(req, res) {
    if (rooms.indexOf(req.params.room) !== -1) {
        if (req.session.user) {
            res.local('loggedin', req.session.user);
        }
        res.render('room', {roomname:req.params.room,rooms:rooms});
    }
    else {
        res.send(404);
    }
};
