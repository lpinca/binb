/**
 * Module dependencies.
 */

var errorHandler = require('./lib/middleware/errorHandler')
  , express = require('express')
  , http = require('http')
  , port = require('./config').port
  , redisstore = require('connect-redis')(express)
  , secret = process.env.SITE_SECRET || 'shhhh, very secret'
  , site = require('./routes/site')
  , user = require('./routes/user')
  , usersdb = require('./lib/redis-clients').users;

/**
 * Setting up Express.
 */

var app = express()
  , pub = __dirname + '/public' // Path to public directory
  , sessionstore = new redisstore({client: usersdb})
  , server = http.createServer(app); // HTTP server object

// Configuration
app.set('view engine', 'jade');
app.use('/static', express.static(pub, {maxAge: 2419200000})); // 4 weeks = 2419200000 ms
app.use(express.favicon(pub + '/img/favicon.ico', {maxAge: 2419200000}));
app.use(express.urlencoded());
app.use(express.cookieParser(secret));
app.use(express.session({
  cookie: {maxAge: 14400000}, // 4 h = 14400000 ms
  rolling: true,
  store: sessionstore
}));
app.use(app.router);
app.use(errorHandler);

// Routes
app.get('/', site.home);
app.get('/artworks', site.artworks);
app.get('/changepasswd', site.validationErrors, site.changePasswd);
app.post('/changepasswd', user.validateChangePasswd, user.checkOldPasswd, user.changePasswd);
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
app.post('/signup', user.validateSignUp, user.userExists, user.emailExists, user.createAccount);
app.get('/:room', site.room);
app.get('/user/:username', user.profile);

/**
 * Setting up the rooms.
 */

require('./lib/rooms')({
  secret: secret,
  server: server,
  sessionstore: sessionstore
});

// Begin accepting connections
server.listen(port, function() {
  console.info('binb server listening on port ' + port);
});
