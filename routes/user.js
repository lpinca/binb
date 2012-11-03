/**
 * Module dependencies.
 */

var crypto = require('crypto')
    , db = require('../lib/redis-clients').users
    , mailer = require('../lib/email/mailer')
    , rooms = require('../config').rooms
    , User = require('../lib/user')
    , utils = require('../lib/utils');

/**
 * Populate the whitelist of follow-up URLs.
 */

var safeurls = ['/', '/changepasswd'];
for (var i=0; i<rooms.length; i++) {
    safeurls.push('/'+rooms[i]);
}

/**
 * Show two lists of users, one ordered by points and one by best guess time (limit set to 30).
 */

exports.leaderboards = function(req, res) {
    db.zrevrange('users', 0, 29, 'withscores', function(err, pointsresults) {
        var sortparams = [
            'users'
            , 'by'
            , 'user:*->bestguesstime'
            , 'get'
            , '#'
            , 'get'
            , 'user:*->bestguesstime'
            , 'limit'
            , '0'
            , '30'
        ];
        db.sort(sortparams, function (e, timesresults) {
            var leaderboards = utils.buildLeaderboards(pointsresults, timesresults);
            res.locals.slogan = utils.randomSlogan();
            res.render('leaderboards', leaderboards);
        });
    });
};

/**
 * Change password middlewares.
 */
 
exports.validateChangePasswd = function(req, res, next) {
    if (!req.session.user || req.body.oldpassword === undefined ||
        req.body.newpassword === undefined) {
        return res.send(412);
    }
    
    var errors = {};
    
    req.body.oldpassword = req.body.oldpassword.trim();
    if (req.body.oldpassword === '') {
        errors.oldpassword = "can't be empty";
    }
    if (!req.body.newpassword.match(/^[A-Za-z0-9]{6,15}$/)) {
        errors.newpassword = '6 to 15 alphanumeric characters required';
    }
    else if(req.body.newpassword === req.body.oldpassword) {
        errors.newpassword = "can't be changed to the old one";
    }
    
    if (errors.oldpassword || errors.newpassword) {
        req.session.errors = errors;
        return res.redirect(req.url);
    }
    
    next();
};

exports.checkOldPasswd = function(req, res, next) {
    var key = 'user:'+req.session.user;
    db.hmget(key, 'salt', 'password', function(err, data) {
        var hash = crypto.createHash('sha256').update(data[0]+req.body.oldpassword).digest('hex');
        if (hash !== data[1]) {
            req.session.errors = {oldpassword: 'is incorrect'};
            return res.redirect(req.url);
        }
        next();
    });
};

exports.changePasswd = function(req, res) {
    var followup = ~safeurls.indexOf(req.query.followup) ? req.query.followup : '/'
        , user = req.session.user
        , key = 'user:'+user
        , salt = crypto.randomBytes(6).toString('base64')
        , password = crypto.createHash('sha256').update(salt+req.body.newpassword).digest('hex');
    db.hmset(key, 'salt', salt, 'password', password, function(err, data) {
        // Regenerate the session
        req.session.regenerate(function() {
            req.session.cookie.maxAge = 604800000; // One week
            req.session.user = user;
            res.redirect(followup);
        });
    });
};

/**
 * Login middlewares.
 */

exports.validateLogin = function(req, res, next) {
    if (req.body.username === undefined || req.body.password === undefined) {
        return res.send(412);
    }

    var errors = {};
    
    req.body.username = req.body.username.trim(); // Username sanitization
    req.body.password = req.body.password.trim(); // Password sanitization
    if (req.body.username === '') {
        errors.username = "can't be empty";
    }
    if (req.body.password === '') {
        errors.password = "can't be empty";
    }
    
    req.session.oldvalues = {username: req.body.username};
    if (errors.username || errors.password) {
        req.session.errors = errors;
        return res.redirect(req.url);
    }
    next();
};

exports.checkUser = function(req, res, next) {
    var key = 'user:'+req.body.username;
    db.exists(key, function(err, data) {
        if (data === 1) {
            // User exists, proceed with authentication
            return next();
        }
        req.session.errors = {alert: 'The username you specified does not exists.'};
        res.redirect(req.url);
    });
};

exports.authenticate = function(req, res) {
    var key = 'user:'+req.body.username;
    db.hmget(key, 'salt', 'password', function(err, data) {
        var hash = crypto.createHash('sha256').update(data[0]+req.body.password).digest('hex');
        if (hash === data[1]) {
            var followup = ~safeurls.indexOf(req.query.followup) ? req.query.followup : '/';
            // Authentication succeeded, regenerate the session
            req.session.regenerate(function() {
                req.session.cookie.maxAge = 604800000; // One week
                req.session.user = req.body.username;
                res.redirect(followup);
            });
            return;
        }
        req.session.errors = {alert: 'The password you specified is not correct.'};
        res.redirect(req.url);
    });
};

/**
 * Logout the user.
 */

exports.logout = function(req, res) {
    // Destroy the session
    req.session.destroy(function() {
        res.redirect('/');
    });
};

/**
 * Sign up middlewares.
 */

exports.validateSignUp = function(req, res, next) {
    if (req.body.username === undefined || req.body.email === undefined ||
        req.body.password === undefined || req.body.captcha === undefined) {
        return res.send(412);
    }

    var errors = {};
    
    req.body.username = req.body.username.trim(); // Username sanitization
    if (req.body.username === 'binb') {
        errors.username = 'is reserved';
    }
    else if (!req.body.username.match(/^[^\x00-\x1F\x7F]{1,15}$/)) {
        errors.username = '1 to 15 characters required';
    }
    if (!utils.isEmail(req.body.email)) {
        errors.email = 'is not an email address';
    }
    if (!req.body.password.match(/^[A-Za-z0-9]{6,15}$/)) {
        errors.password = '6 to 15 alphanumeric characters required';
    }
    if (req.body.captcha !== req.session.captchacode) {
        errors.captcha = 'no match';
    }
    
    // Save old values to repopulate the fields in case of future errors
    req.session.oldvalues = {
        username: req.body.username,
        email: req.body.email
    };
    
    if (errors.username || errors.email || errors.password || errors.captcha) {
        req.session.errors = errors;
        return res.redirect(req.url);
    }
    
    next();
};

exports.userExists = function(req, res, next) {
    var key = 'user:'+req.body.username;
    db.exists(key, function(err, data) {
        if (data === 1) {
            // User already exists
            req.session.errors = {alert: 'A user with that name already exists.'};
            return res.redirect(req.url);
        }
        next();
    });
};

exports.emailExists = function(req, res, next) {
    var key = 'email:'+req.body.email;
    db.exists(key, function(err, data) {
        if (data === 1) {
            // Email already exists
            req.session.errors = {alert: 'A user with that email already exists.'};
            return res.redirect(req.url);
        }
        next();
    });
};

exports.createAccount = function(req, res) {
    var userkey = 'user:'+req.body.username
        , mailkey = 'email:'+req.body.email
        , salt = crypto.randomBytes(6).toString('base64')
        , hash = crypto.createHash('sha256').update(salt+req.body.password).digest('hex')
        , date = new Date()
        , day = date.getDate()
        , month = date.getMonth() + 1
        , year = date.getFullYear();

    if (day < 10) {
        day = '0' + day;
    }
    if (month < 10) {
        month = '0' + month;
    }
    var joindate = day+'/'+month+'/'+year;
    var user = new User(req.body.username, req.body.email, salt, hash, joindate);
    // Add new user in the db
    db.hmset(userkey, user);
    db.set(mailkey, userkey);
    db.zadd('users', 0, req.body.username);
    db.sadd('emails', req.body.email);
    // Delete old fields values
    delete req.session.oldvalues;
    res.render('login', {
        followup: req.query.followup || '/',
        slogan: utils.randomSlogan(),
        success: 'You successfully created your account. You are now ready to login.'
    });
};

/**
 * Recover password middlewares.
 */
 
exports.validateRecoverPasswd = function(req, res, next) {
    if (req.body.email === undefined || req.body.captcha === undefined) {
        return res.send(412);
    }

    var errors = {};
    
    if (!utils.isEmail(req.body.email)) {
        errors.email = 'is not an email address';
    }
    if (req.body.captcha !== req.session.captchacode) {
        errors.captcha = 'no match';
    }
    
    req.session.oldvalues = {email: req.body.email};
    
    if (errors.email || errors.captcha) {
        req.session.errors = errors;
        return res.redirect(req.url);
    }
    
    next();
};

exports.sendEmail = function(req, res) {
    var key = 'email:'+req.body.email;
    db.get(key, function(err, data) {
        if (data !== null) {
            // Email exists, generate a secure random token
            delete req.session.captchacode;
            var token = crypto.randomBytes(48).toString('hex');
            // Token expires after 4 hours
            db.setex('token:'+token, 14400, data, function(err, reply) {
                mailer.sendEmail(req.body.email, token, function(err, response) {
                    if (err) {
                        console.log('error sending email: '+err.message);
                    }
                });
            });
            delete req.session.oldvalues;
            return res.render('recoverpasswd', {
                followup: req.query.followup || '/',
                slogan: utils.randomSlogan(),
                success: true
            });
        }
        req.session.errors = {alert: 'The email address you specified could not be found'};
        res.redirect(req.url);
    });
};

/**
 * Reset user password.
 */

exports.resetPasswd = function(req, res) {
    if (req.body.password === undefined) {
        return res.send(412);
    }
    
    var errors = {};
    
    // Validate new password
    if (!req.body.password.match(/^[A-Za-z0-9]{6,15}$/)) {
        errors.password = '6 to 15 alphanumeric characters required';
    }
    // Check token availability
    if (!req.query.token) {
        errors.alert = 'Missing token.';
    }
    
    if (errors.password || errors.alert) {
        req.session.errors = errors;
        return res.redirect(req.url);
    }
    
    var key = 'token:'+req.query.token;
    db.get(key, function(err, user) {
        if (user !== null) {
            // Delete the token
            db.del(key);
            // Update password
            var salt = crypto.randomBytes(6).toString('base64');
            var password = crypto.createHash('sha256').update(salt+req.body.password).digest('hex');
            db.hmset(user, 'salt', salt, 'password', password, function(err, data) {
                res.render('login', {
                    followup: '/',
                    slogan: utils.randomSlogan(),
                    success: 'You can now login with your new password.'
                });
            });
            return;
        }
        req.session.errors = {alert: 'Invalid or expired token.'};
        res.redirect(req.url);
    });
};

/**
 * Show user profile.
 */

exports.profile = function(req, res) {
    var key = 'user:'+req.params[0];
    db.exists(key, function(err, data) {
        if (data === 1) {
            db.hgetall(key, function(e, obj) {
                obj.bestguesstime = (obj.bestguesstime/1000).toFixed(1);
                obj.worstguesstime = (obj.worstguesstime/1000).toFixed(1);
                if (obj.guessed !== '0') {
                    obj.meanguesstime = ((obj.totguesstime/obj.guessed)/1000).toFixed(1);
                }
                delete obj.email;
                delete obj.password;
                delete obj.salt;
                delete obj.totguesstime;
                res.locals.slogan = utils.randomSlogan();
                res.render('user', obj);
            });
            return;
        }
        res.send(404);
    });
};
