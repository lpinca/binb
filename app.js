/**
 * Module dependencies.
 */

var config = require('./config')
    , express = require('express')
    , http = require('http')
    , parseCookie = require('express/node_modules/cookie').parse
    , parseSignedCookies = require('express/node_modules/connect').utils.parseSignedCookies
    , redisstore = require('connect-redis')(express)
    , site = require('./routes/site')
    , user = require('./routes/user')
    , usersdb = require('./lib/redis-clients').users;

/**
 * Setting up Express.
 */

var app = express()
    , pub = __dirname + '/public' // Path to public directory
    , sessionstore = new redisstore({client: usersdb});

// Configuration
app.set('view engine', 'jade');
app.use('/static', express.static(pub, {maxAge: 2419200000})); // 4 weeks = 2419200000 ms
app.use(express.favicon(pub + '/img/favicon.ico', {maxAge: 2419200000}));
app.use(express.bodyParser());
app.use(express.cookieParser(process.env.SITE_SECRET));
app.use(express.session({store: sessionstore, cookie: {maxAge: 14400000}})); // 4 h = 14400000 ms

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
app.get('/user/*', user.profile);

// HTTP server object
var server = http.createServer(app);

/**
 * Setting up Socket.IO.
 */

var io = require('socket.io').listen(server)
    , sockets = Object.create(null); // Sockets of all rooms

// Configuration
io.enable('browser client minification');
io.enable('browser client etag');
io.enable('browser client gzip');
io.set('log level', 1);
io.set('transports', [
    'websocket'
    , 'htmlfile'
    , 'xhr-polling'
    , 'jsonp-polling'
]);

// Authorization
io.set('authorization', function(data, accept) {
    if(!data.headers.cookie) {
        return accept('no cookie transmitted', false);
    }
    var signedcookie = parseCookie(data.headers.cookie);
    var cookie = parseSignedCookies(signedcookie, process.env.SITE_SECRET);
    sessionstore.get(cookie['connect.sid'], function(err, session) {
        if (err) {
            return accept(err.message, false);
        }
        else if (!session) {
            var debuginfos = {
                address: data.headers['x-forwarded-for'],
                ua: data.headers['user-agent'],
                cookie: data.headers.cookie
            };
            console.log(debuginfos);
            return accept('session not found', false);
        }
        data.session = session;
        accept(null, true);
    });
});

io.sockets.on('connection', function(socket) {
    var session = socket.handshake.session;
    socket.on('disconnect', function() {
        if (socket.roomname) {
            rooms[socket.roomname].removeUser(socket.nickname);
        }
    });
    socket.on('getoverview', function(callback) {
        if (typeof callback !== 'function') {
            return;
        }
        var data = Object.create(null);
        for (var prop in rooms) {
            data[prop] = rooms[prop].getPopulation();
        }
        callback(data);
    });
    socket.on('getstatus', function(callback) {
        if (socket.roomname && typeof callback === 'function') {
            rooms[socket.roomname].sendStatus(callback);
        }
    });
    socket.on('guess', function(guess) {
        if (socket.roomname && typeof guess === 'string') {
            rooms[socket.roomname].guess(socket, guess);
        }
    });
    socket.on('ignore', function(who, callback) {
        if (socket.roomname && typeof who === 'string' && typeof callback === 'function') {
            rooms[socket.roomname].ignore(who, socket.nickname, callback);
        }
    });
    socket.on('joinanonymously', function(nickname, roomname) {
        if (!socket.nickname && typeof nickname === 'string' && nickname !== '' &&
            ~config.rooms.indexOf(roomname)) {
            rooms[roomname].setNickName(socket, nickname);
        }
    });
    socket.on('joinroom', function(room) {
        if (session.user && ~config.rooms.indexOf(room)) {
            if (sockets[session.user]) { // User already in a room
                socket.emit('alreadyinaroom');
                return;
            }
            socket.nickname = session.user;
            rooms[room].joinRoom(socket);
        }
    });
    socket.on('kick', function(who, why, callback) {
        if (socket.roomname && typeof who === 'string' && typeof why === 'string' &&
            typeof callback === 'function') {
            rooms[socket.roomname].kick(who, why, socket.nickname, callback);
        }
    });
    socket.on('loggedin', function(callback) {
        if (typeof callback !== 'function') {
            return;
        }
        return (session.user) ? callback(session.user) : callback(false);
    });
    socket.on('sendchatmsg', function(msg, to) {
        if (socket.roomname && typeof msg === 'string') {
            rooms[socket.roomname].sendChatMessage(msg, socket, to);
        }
    });
    socket.on('unignore', function(who) {
        if (socket.roomname && typeof who === 'string') {
            rooms[socket.roomname].unignore(who, socket.nickname);
        }
    });
});

/**
 * Setting up the rooms.
 */

var Room = require('./lib/room')({io: io, sockets: sockets})
    , rooms = Object.create(null); // The Object that contains all the room instances

for (var i=0; i<config.rooms.length; i++) {
    rooms[config.rooms[i]] = new Room(config.rooms[i]);
    rooms[config.rooms[i]].start();
}

// Begin accepting connections
server.listen(config.port, function() {
    console.log('binb server listening on port ' + config.port);
});
