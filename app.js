/**
 * Module dependencies.
 */

var errorHandler = require('./lib/middleware/errorHandler')
  , express = require('express')
  , favicon = require('static-favicon')
  , http = require('http')
  , port = require('./config').port
  , session = require('express-session')
  , RedisStore = require('connect-redis')(session)
  , secret = process.env.SITE_SECRET || 'shhhh, very secret'
  , cookieParser = require('cookie-parser')(secret)
  , site = require('./routes/site')
  , urlencoded = require('body-parser').urlencoded
  , user = require('./routes/user')
  , usersdb = require('./lib/redis-clients').users;

/**
 * Setting up Express.
 */

var app = express()
  , pub = __dirname + '/public' // Path to public directory
  , sessionstore = new RedisStore({client: usersdb})
  , server = http.createServer(app); // HTTP server object

// Configuration
app.set('view engine', 'jade');
app.use('/static', express.static(pub, {maxAge: 2419200000})); // 4 weeks = 2419200000 ms
app.use(favicon(pub + '/img/favicon.ico', {maxAge: 2419200000}));
app.use(urlencoded());
app.use(cookieParser);
app.use(session({
  cookie: {maxAge: 14400000}, // 4 h = 14400000 ms
  rolling: true,
  store: sessionstore
}));

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
