'use strict';

const banHandler = require('./lib/middleware/ban-handler');
const errorHandler = require('./lib/middleware/error-handler');
const express = require('express');
const favicon = require('serve-favicon');
const http = require('http');
const port = require('./config').port;
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const secret = process.env.SITE_SECRET || 'shhhh, very secret';
const cookieParser = require('cookie-parser')(secret);
const site = require('./routes/site');
const urlencoded = require('body-parser').urlencoded;
const user = require('./routes/user');
const usersdb = require('./lib/redis-clients').users;

/**
 * Setting up Express.
 */

const app = express();
const production = process.env.NODE_ENV === 'production';
const pub = __dirname + '/public'; // Path to public directory
const sessionstore = new RedisStore({ client: usersdb });
const server = http.createServer(app); // HTTP server object

// Configuration
app.set('view engine', 'pug');
app.use('/static', express.static(pub, { maxAge: 2419200000 })); // 4 weeks = 2419200000 ms
app.use(favicon(pub + '/img/favicon.ico', { maxAge: 2419200000 }));
app.use(banHandler);
app.use(urlencoded({ extended: false }));
app.use(cookieParser);
app.use(
  session({
    cookie: {
      secure: production,
      maxAge: 14400000 // 4 h = 14400000 ms
    },
    proxy: production,
    resave: false,
    rolling: true,
    saveUninitialized: true,
    secret: secret,
    store: sessionstore
  })
);

// Routes
app.get('/', site.home);
app.get('/artworks', site.artworks);
app.get('/changepasswd', site.validationErrors, site.changePasswd);
app.post(
  '/changepasswd',
  user.validateChangePasswd,
  user.checkOldPasswd,
  user.changePasswd
);
app.get('/leaderboards', user.leaderboards);
app.get('/login', site.validationErrors, site.login);
app.post('/login', user.validateLogin, user.checkUser, user.authenticate);
app.get('/logout', user.logout);
app.get('/recoverpasswd', site.validationErrors, site.recoverPasswd);
app.post('/recoverpasswd', user.validateRecoverPasswd, user.sendEmail);
app.get('/resetpasswd', site.validationErrors, site.resetPasswd);
app.post('/resetpasswd', user.resetPasswd);
app.get('/sliceleaderboard', user.sliceLeaderboard);
app.get('/signup', site.validationErrors, site.signup);
app.post(
  '/signup',
  user.validateSignUp,
  user.userExists,
  user.emailExists,
  user.createAccount
);
app.get('/:room', site.room);
app.get('/user/:username', user.profile);

app.use(errorHandler);

/**
 * Setting up the rooms.
 */

require('./lib/rooms')({
  parser: cookieParser,
  server: server,
  sessionstore: sessionstore
});

// Begin accepting connections
server.listen(port, function() {
  console.info('binb server listening on port ' + port);
});
