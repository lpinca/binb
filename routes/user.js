/**
 * Module dependencies.
 */

var crypto = require('crypto')
    , db
    , User = require('../lib/user');
    
/**
 * Extend String with custom methods for input validation.
 */

String.prototype.trim = function() {
    return this.replace(/^[\r\n\t\s]+|[\r\n\t\s]+$/g, '');
};

String.prototype.isEmail = function() {
    return this.match(/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/);
};

/**
 * Initialize dependencies.
 */

exports.use = function(options) {
    db = options.db;
};

/**
 * Sign up middlewares.
 */

exports.validateSignUp = function(req, res, next) {
    var errors = {};
    
    req.body.username = req.body.username.trim(); // Username sanitization
    if (req.body.username === 'binb') {
        errors.username = 'is reserved';
    }
    else if (!req.body.username.match(/^[^\x00-\x1F\x7F]{1,15}$/)) {
        errors.username = '1 to 15 characters required';
    }
    if (!req.body.email.isEmail()) {
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
        return res.redirect('/signup');
    }
    
    next();
};

exports.userExists = function(req, res, next) {
    var key = 'user:'+req.body.username;
    db.exists(key, function(err, data) {
        if (data === 1) { 
            // User already exists
            req.session.errors = {alert: 'A user with that name already exists.'};
            return res.redirect('/signup');
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
            return res.redirect('/signup');
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
    db.sadd('users', userkey);
    db.sadd('emails', mailkey);
    // Delete old fields values (we don't want these to be available in login view)
    delete req.session.oldvalues;
    var msg = 'You successfully created your account. You are now ready to login.';
    res.render('login', {success:msg});
};

/**
 * Login middlewares.
 */

exports.validateLogin = function(req, res, next) {
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
        return res.redirect('/login');
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
        res.redirect('/login');
    });
};

exports.authenticate = function(req, res) {
    var key = 'user:'+req.body.username;
    db.hmget(key, 'salt', 'password', function(err, data) {
        var hash = crypto.createHash('sha256').update(data[0]+req.body.password).digest('hex');
        if (hash === data[1]) {
            // Authentication succeeded, regenerate the session
            req.session.regenerate(function() {
                req.session.cookie.maxAge = 604800000; // One week
                req.session.user = req.body.username;
                res.redirect('/');
            });
            return;
        }
        req.session.errors = {alert: 'The password you specified is not correct.'};
        res.redirect('/login');
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
 * Show user profile.
 */

exports.profile = function(req, res) {
    var key = 'user:'+req.params[0];
    db.exists(key, function(err, data) {
        if (data === 1) {
            db.hgetall(key, function(e, obj) {
                obj.username = obj.username.replace(/&/g, '&amp;');
                obj.bestguesstime = (obj.bestguesstime/1000).toFixed(1);
                obj.worstguesstime = (obj.worstguesstime/1000).toFixed(1);
                if (obj.guessed !== '0') {
                    obj.meanguesstime = ((obj.totguesstime/obj.guessed)/1000).toFixed(1);
                }
                delete obj.email;
                delete obj.password;
                delete obj.salt;
                delete obj.totguesstime;
                res.render('user', obj);
            });
            return;
        }
        res.send(404);
    });
};
