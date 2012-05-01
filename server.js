var async = require('async');
var characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
var Captcha = require('./lib/captcha.js')(characters);
var config = require('./config.js').configure();
var crypto = require('crypto');
var express = require('express');
var form = require('express-form');
var parseCookie = require('connect').utils.parseCookie;
var redisstore = require('connect-redis')(express);
var rooms = Object.create(null); // The Object that contains all the room instances
var sockets = Object.create(null); // Sockets of all rooms

// Setting up Redis
var songsdb = require("redis-url").createClient(config.songsdburl);
var usersdb = require("redis-url").createClient(config.usersdburl);

songsdb.on('error', function(err) {
	console.log("Error: "+err);
});

usersdb.on('error', function(err) {
	console.log("Error: "+err);
});

// Setting up Express
var sessionstore = new redisstore({client:usersdb});
var http = express.createServer();

// Configuration
http.use(express.static(__dirname + '/public'));
http.use(express.bodyParser());
http.use(express.cookieParser());
http.use(express.session({secret:config.sessionsecret,store:sessionstore}));
http.set("view options", {layout:false});
http.set('view engine', 'jade');

// Routes
http.get("/", function(req, res) {
	if (req.session.user) {
		res.local('loggedin', req.session.user.replace(/&/g, "&amp;"));
	}
	res.render("index", {rooms:config.rooms});
});

http.get("/signup", function(req, res) {
	var captcha = new Captcha();
	req.session.captchacode = captcha.getCode();
	res.render("signup", {captchaurl:captcha.toDataURL()});
});

// Sign up route middlewares
var checkCaptcha = function(req, res, next) {
	if (req.form.isValid) {
		if (req.session.captchacode !== req.form.captcha) {
			var errors = {captcha:['no match']};
			var captcha = new Captcha();
			req.session.captchacode = captcha.getCode();
			return res.render("signup", {errors:errors,captchaurl:captcha.toDataURL()});
		}
		next();
	}
	else {
		var captcha = new Captcha();
		req.session.captchacode = captcha.getCode();
		res.render("signup", {errors:req.form.getErrors(),captchaurl:captcha.toDataURL()});
	}
};

var checkUserExists = function(req, res, next) {
	var userkey = "user:"+req.form.username;
	usersdb.exists(userkey, function(err, data) {
		if (data === 1) { // User already exists
			var errors = {alert: "A user with name "+req.form.username+" already exists."};
			var captcha = new Captcha();
			req.session.captchacode = captcha.getCode();
			return res.render("signup", {errors:errors,captchaurl:captcha.toDataURL()});
		}
		next();
	});
};

var checkEmailExists = function(req, res, next) {
	var mailkey = "email:"+req.form.email;
	usersdb.exists(mailkey, function(err, data) {
		if (data === 1) { // Email already exists
			var errors = {alert: "A user with that email already exists."};
			var captcha = new Captcha();
			req.session.captchacode = captcha.getCode();
			return res.render("signup", {errors:errors,captchaurl:captcha.toDataURL()});
		}
		next();
	});
};

http.post("/signup", 
	form(
		form.filter("username").trim().required().not(/binb/, "is reserved")
			.is(/^[^\x00-\x1F\x7F]{1,15}$/, "1 to 15 characters required"),
		form.filter("email").required().isEmail("is not an email address"),
		form.filter("password").required()
			.is(/^[A-Za-z0-9]{6,15}$/, "6 to 15 alphanumeric characters required"),
		form.filter("captcha").required()
	),
	checkCaptcha,
	checkUserExists,
	checkEmailExists,
	function (req, res) { // Set up the account
		var userkey = "user:"+req.form.username;
		var mailkey = "email:"+req.form.email;
		var salt = "";
		while (salt.length < 8) {
			salt += characters[Math.floor(Math.random() * characters.length)];
		}
		var hash = crypto.createHash('sha256').update(salt+req.form.password).digest('hex');
		var date = new Date();
		var joindate = date.getDate()+"/"+(date.getMonth()+1)+"/"+date.getFullYear();
		usersdb.hmset(
			userkey,
			"username", req.form.username,
			"email", req.form.email,
			"password", hash,
			"salt", salt,
			"joindate", joindate,
			"totpoints", 0,
			"bestscore", 0,
			"golds", 0,
			"silvers", 0,
			"bronzes", 0,
			"bestguesstime", 30000,
			"worstguesstime", 0,
			"totguesstime", 0,
			"guessed", 0,
			"victories", 0,
			"secondplaces", 0,
			"thirdplaces", 0
		);
		usersdb.set(mailkey, userkey);
		usersdb.sadd("users", userkey);
		usersdb.sadd("emails", mailkey);
		var msg = "You successfully created your account. You are now ready to login.";
		res.render("login", {success:msg});
	}
);

http.get("/login", function(req, res) {
	res.render("login");
});

http.post("/login", 
	form(
		form.filter("username").trim().required(),
		form.filter("password").trim().required()
	),
	function(req, res, next) {
		if (req.form.isValid) {
			usersdb.exists("user:"+req.form.username, function(err, data) {
				if (data === 1) { // User exists
					next();
				}
				else {
					var errors = {alert: "The username you specified does not exists."};
					res.render("login", {errors:errors});
				}
			});
		}
		else {
			res.render("login", {errors:req.form.getErrors()});
		}
	},
	function(req, res) { // Authenticate User
		usersdb.hmget("user:"+req.form.username, "salt", "password", function(err, data) {
			var hash = crypto.createHash('sha256').update(data[0]+req.body.password).digest('hex');
			if (hash === data[1]) {
				req.session.regenerate(function() {
					req.session.cookie.maxAge = 604800000; // One week
					req.session.user = req.form.username;
					res.redirect('/');
				});
			}
			else {
				var errors = {alert: "The password you specified is not correct."};
				res.render("login", {errors:errors});
			}
		});
	}
);

http.get("/logout", function(req, res) {
	req.session.destroy(function() {
		res.redirect("/");
	});
});

var makeCallBack = function(genre) {
	return function(callback) {
		songsdb.srandmember(genre, function(err, res) {
			songsdb.hget(res, "artworkUrl100", callback);
		});
	};
};

http.get("/artworks", function(req, res) {
	var callitems = [];
	for (var i=0; i<config.rooms.length; i++) {
		for (var j=0; j<6; j++) {
			callitems.push(makeCallBack(config.rooms[i]));
		}
	}
	async.parallel(callitems, function(err, results) {
		var obj = {
			resultCount: results.length,
			results: results
		};
		res.writeHead(200, {"Content-Type": "application/json"});
		res.end(JSON.stringify(obj));
	});
});

http.get("/:room", function(req, res) {
	if (config.rooms.indexOf(req.params.room) !== -1) {
		if (req.session.user) {
			res.local('loggedin', req.session.user.replace(/&/g, "&amp;"));
		}
		res.render("room", {roomname:req.params.room,rooms:config.rooms});
	}
	else {
		res.send(404);
	}
});

http.get("/user/*", function(req, res) {
	var key = "user:"+req.params[0];
	usersdb.exists(key, function(err, data) {
		if (data === 1) {
			usersdb.hgetall(key, function(e, obj) {
				obj.username = obj.username.replace(/&/g, "&amp;");
				obj.bestguesstime = (obj.bestguesstime/1000).toFixed(1);
				obj.worstguesstime = (obj.worstguesstime/1000).toFixed(1);
				if (obj.guessed !== "0") {
					obj.meanguesstime = ((obj.totguesstime/obj.guessed)/1000).toFixed(1);
				}
				delete obj.email;
				delete obj.password;
				delete obj.salt;
				delete obj.totguesstime;
				res.render("user", obj);
			});
		}
		else {
			res.send(404);
		}
	});
});

// Starting HTTP server
http.listen(config.port);

// Setting up Socket.IO
var io = require("socket.io").listen(http);

io.enable('browser client minification');	// send minified client
io.enable('browser client etag');			// apply etag caching logic based on version number
io.enable('browser client gzip');			// gzip the file
io.set('log level', 1);						// reduce logging
// enable transports
io.set('transports', ['websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);

io.set('authorization', function(data, accept) {
	if(data.headers.cookie) {
		var cookie = parseCookie(data.headers.cookie);
		sessionstore.get(cookie['connect.sid'], function(err, session) {
			if (err || !session) {
				accept('Error', false);
			}
			else {
				data.session = session;
				accept(null, true);
			}
		});
	}
	else {
		return accept('No cookie transmitted.', false);
	}
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
	socket.on('joinroom', function(data) {
		if (session.user && typeof data === "string" && config.rooms.indexOf(data) !== -1) {
			if (sockets[session.user]) { // User already in a room
				socket.emit('alreadyinaroom');
				return;
			}
			socket.nickname = session.user;
			rooms[data].joinRoom(socket);
		}
	});
	socket.on('joinanonymously', function(data) {
		if (!socket.nickname && typeof data === "object" && typeof data.nickname === "string" &&
			data.nickname !== "" && typeof data.roomname === "string" && 
			config.rooms.indexOf(data.roomname) !== -1) {
			rooms[data.roomname].setNickName(socket, data);
		}
	});
	socket.on('getstatus', function() {
		if (socket.roomname) {
			rooms[socket.roomname].sendStatus(socket);
		}
	});
	socket.on('sendchatmsg', function(data) {
		if (socket.roomname) {
			rooms[socket.roomname].sendChatMessage(socket, data);
		}
	});
	socket.on('guess', function(data) {
		if (socket.roomname && typeof data === "string") {
			rooms[socket.roomname].guess(socket, data);
		}
	});
	socket.on("disconnect", function() {
		if (socket.roomname) {
			rooms[socket.roomname].userLeft(socket.nickname);
		}
	});
});

// Setting up the rooms
var roomoptions = {
	songsdb: songsdb,
	usersdb: usersdb,
	io: io,
	sockets: sockets,
	songsinarun: config.songsinarun,
	fifolength: config.fifolength,
	threshold: config.threshold
};

var Room = require('./lib/room.js')(roomoptions);

for (var i=0; i<config.rooms.length; i++) {
	rooms[config.rooms[i]] = new Room(config.rooms[i]);
	rooms[config.rooms[i]].start();
}

console.log("binb started and listening on port "+config.port);
