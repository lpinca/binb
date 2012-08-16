/**
 * Module dependencies.
 */

var config = require('./config')
    , express = require('express')
    , http = require('http')
    , parseCookie = require('express/node_modules/cookie').parse
    , parseSignedCookies = require('express/node_modules/connect').utils.parseSignedCookies
    , redisstore = require('connect-redis')(express)
    , redisurl = require('redis-url')
    , site = require('./routes/site')
    , user = require('./routes/user');

/**
 * Setting up redis.
 */

var songsdb = redisurl.createClient(process.env.SONGS_DB_URL)
    , usersdb = redisurl.createClient(process.env.USERS_DB_URL);

songsdb.on('error', function(err) {
    console.log(err.message);
});

usersdb.on('error', function(err) {
    console.log(err.message);
});

/**
 * Setting up Express.
 */

var app = express()
    , sessionstore = new redisstore({client:usersdb});

// Configuration
app.use(express.static(__dirname + '/public'), {maxAge: 2592000000});
app.use(express.favicon(__dirname + '/public/static/images/favicon.ico', {maxAge: 2592000000}));
app.use(express.bodyParser());
app.use(express.cookieParser(process.env.SITE_SECRET));
app.use(express.session({store:sessionstore}));
app.set('view engine', 'jade');

// Middleware to report errors during form submission
app.use(function(req, res, next) {
    if (req.session.errors) {
        res.locals.errors = req.session.errors;
        delete req.session.errors;
    }
    if (req.session.oldvalues) {
        res.locals.oldvalues = req.session.oldvalues;
        delete req.session.oldvalues;
    }
    next();
});

// Routes
site.use({db:songsdb,rooms:config.rooms});
user.use({db:usersdb,rooms:config.rooms});

app.get('/', site.index);
app.get('/artworks', site.artworks);
app.get('/changepasswd', site.changePasswd);
app.post('/changepasswd', user.validateChangePasswd, user.checkOldPasswd, user.changePasswd);
app.get('/leaderboards', user.leaderboards);
app.get('/login', site.login);
app.post('/login', user.validateLogin, user.checkUser, user.authenticate);
app.get('/logout', user.logout);
app.get('/signup', site.signup);
app.post('/signup', user.validateSignUp, user.userExists, user.emailExists, user.createAccount);
app.get('/recoverpasswd', site.recoverPasswd);
app.post('/recoverpasswd', user.validateRecoverPasswd, user.sendEmail);
app.get('/resetpasswd', site.resetPasswd);
app.post('/resetpasswd', user.resetPasswd);
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
    var signedcookie = parseCookie(decodeURIComponent(data.headers.cookie));
    var cookie = parseSignedCookies(signedcookie, process.env.SITE_SECRET);
    sessionstore.get(cookie['connect.sid'], function(err, session) {
        if (err) {
            return accept(err.message, false);
        }
        else if (!session) {
            return accept('session not found', false);
        }
        data.session = session;
        accept(null, true);
    });
});

io.sockets.on('connection', function(socket) {
    var session = socket.handshake.session;
    socket.on('getoverview', function() {
        var data = Object.create(null);
        for (var prop in rooms) {
            data[prop] = rooms[prop].getPopulation();
        }
        socket.join('home');
        socket.emit('overview', data);
    });
    socket.on('loggedin', function(fn) {
        return (session.user) ? fn(session.user) : fn(false);
    });
    socket.on('joinroom', function(room) {
        if (session.user && typeof room === 'string' && config.rooms.indexOf(room) !== -1) {
            if (sockets[session.user]) { // User already in a room
                socket.emit('alreadyinaroom');
                return;
            }
            socket.nickname = session.user;
            rooms[room].joinRoom(socket);
        }
    });
    socket.on('joinanonymously', function(nickname, roomname) {
        if (!socket.nickname && typeof nickname === 'string' && nickname !== '' &&
            typeof roomname === 'string' && config.rooms.indexOf(roomname) !== -1) {
            rooms[roomname].setNickName(socket, nickname);
        }
    });
    socket.on('getstatus', function() {
        if (socket.roomname) {
            rooms[socket.roomname].sendStatus(socket);
        }
    });
    socket.on('sendchatmsg', function(msg, to) {
        if (socket.roomname && typeof msg === 'string') {
            rooms[socket.roomname].sendChatMessage(msg, socket, to);
        }
    });
    socket.on('guess', function(guess) {
        if (socket.roomname && typeof guess === 'string') {
            rooms[socket.roomname].guess(socket, guess);
        }
    });
    socket.on('disconnect', function() {
        if (socket.roomname) {
            rooms[socket.roomname].removeUser(socket.nickname);
        }
    });
});

/**
 * Setting up the rooms.
 */

var roomoptions = {
    songsdb: songsdb,
    usersdb: usersdb,
    io: io,
    sockets: sockets,
    songsinarun: config.songsinarun,
    fifolength: config.songsinarun * config.gameswithnorepeats,
    threshold: config.allowederrors
};

var Room = require('./lib/room')(roomoptions)
    , rooms = Object.create(null); // The Object that contains all the room instances

for (var i=0; i<config.rooms.length; i++) {
    rooms[config.rooms[i]] = new Room(config.rooms[i]);
    rooms[config.rooms[i]].start();
}

// Begin accepting connections
server.listen(config.port);
console.log('   binb started and listening on port ' + config.port);
