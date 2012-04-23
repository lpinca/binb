var async = require("async");
var crypto = require("crypto");
var canvas = require("canvas");
var express = require("express");
var form = require("express-form");
var parseCookie = require('connect').utils.parseCookie;
var redisstore = require('connect-redis')(express);
var config = require("./config.js").configure();

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

// Captcha generator
const CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

var Captcha = function() {
	var code = "";
	while (code.length < 4) {
		code += CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
	}
	var _canvas = new canvas(64, 26);
	var ctx = _canvas.getContext('2d');
	ctx.fillStyle = "#DDDDDD";
	ctx.fillRect(0, 0, 64, 26);
	ctx.font = "bold 20px Helvetica";
	ctx.lineWidth = 1;
	ctx.textAlign = "center";
	ctx.strokeStyle = "#080";
	ctx.strokeText(code, 31, 20);
	ctx.save();
	this.getCode = function() {
		return code;
	}
	this.toDataURL = function() {
		return _canvas.toDataURL();
	}
};

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
			salt += CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
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
		for (var prop in Rooms) {
			data[prop] = Rooms[prop].getPopulation();
		}
		socket.join('home');
		socket.emit('overview', data);
	});
	socket.on('loggedin', function(fn) {
		return (session.user) ? fn(session.user) : fn(false);
	});
	socket.on('joinroom', function(data) {
		if (session.user && typeof data === "string" && config.rooms.indexOf(data) !== -1) {
			if (getUserSocket(session.user)) { // User already in a room
				socket.emit('alreadyinaroom');
				return;
			}
			socket.nickname = session.user;
			Rooms[data].joinRoom(socket);
		}
	}); 
	socket.on('joinanonymously', function(data) {
		if (!socket.nickname && typeof data === "object" && typeof data.nickname === "string" &&
			data.nickname !== "" && typeof data.roomname === "string" && 
			config.rooms.indexOf(data.roomname) !== -1) {
			Rooms[data.roomname].setNickName(socket, data);
		}
	});
	socket.on('getstatus', function() {
		if (socket.roomname) {
			Rooms[socket.roomname].sendStatus(socket);
		}
	});
	socket.on('sendchatmsg', function(data) {
		if (socket.roomname) {
			Rooms[socket.roomname].sendChatMessage(socket, data);
		}
	});
	socket.on('guess', function(data) {
		if (socket.roomname && typeof data === "string") {
			Rooms[socket.roomname].guess(socket, data);
		}
	});
	socket.on("disconnect", function() {
		if (socket.roomname && socket.nickname) {
			Rooms[socket.roomname].userLeft(socket);
		}
	});
});

// Sockets of all rooms
var sockets = Object.create(null);

// Get the socket of a player
var getUserSocket = function(nickname) {
	return sockets[nickname];
};

/*
Check if the edit distance between two strings is smaller than a threshold k.
We dont need to trace back the optimal alignment, so we can run the Levenshtein distance
algorithm in better than O(n*m).
We use only a diagonal stripe of width 2k+1 in the matrix.
See Algorithms on strings, trees, and sequences: computer science and computational biology.
Cambridge, UK: Cambridge University Press. pp 263-264. ISBN 0-521-58519-8.
*/
var checkDistance = function(s1, s2, k) {
	if (k === 0) {
		return s1 === s2;
	}
	if (Math.abs(s1.length - s2.length) > k) {
		return false;
	}
	var d = [];
	for (var i=0; i <= s1.length; i++) {
		d[i] = []; // Now d is a matrix with s1.length + 1 rows
		d[i][0] = i;
	}
	for (var j=0; j <= s2.length; j++) {
		d[0][j] = j;
	}
	for (i=1; i <= s1.length; i++) {
		var l = ((i-k) < 1) ? 1 : i-k;
		var m = ((i+k) > s2.length) ? s2.length : i+k;
		for (j=l; j<=m; j++) {
			if (s1.charAt(i-1) === s2.charAt(j-1)) {
				d[i][j] = d[i-1][j-1];
			}
			else {
				if ((j === l) && (d[i][j-1] === undefined)) {
					d[i][j] = Math.min(d[i-1][j-1]+1, d[i-1][j]+1);
				}
				else if ((j === m) && (d[i-1][j] === undefined)) {
					d[i][j] = Math.min(d[i][j-1]+1, d[i-1][j-1]+1);
				}
				else {
					d[i][j] = Math.min(d[i][j-1]+1, d[i-1][j-1]+1, d[i-1][j]+1);
				}
			}
		}
	}
	return d[s1.length][s2.length] <= k;
};

var amatch = function(subject, guess, enableartistrules) {
	if (checkDistance(subject, guess, config.threshold)) {
		return true;
	}
	var splitted, trimmed;
	if (subject.match(/\./) && 
		checkDistance(subject.replace(/\./g, ""), guess, config.threshold)) {
		return true;
	}
	if (subject.match(/\-/) && 
		checkDistance(subject.replace(/\-/g, ""), guess, config.threshold)) {
		return true;
	}
	if (enableartistrules) {
		if (subject.match(/^the /)) {
			var nothe = subject.replace(/^the /, "");
			if (checkDistance(nothe, guess, config.threshold)) {
				return true;
			}
			if (nothe.match(/jimi hendrix experience/) && 
				checkDistance(nothe.replace(/ experience/, ""), guess, config.threshold)) {
				return true;
			}
		}
		splitted = subject.split("&");
		if (splitted.length !== 1) {
			for (var i=0; i<splitted.length; i++) {
				trimmed = splitted[i].replace(/^ +/, "").replace(/ +$/, "");
				if (checkDistance(trimmed, guess, config.threshold)) {
					return true;
				}
				if (trimmed.match(/^the /) && 
					checkDistance(trimmed.replace(/^the /, ""), guess, config.threshold)) {
					return true;
				}
			}
		}
	}
	else {
		if (subject.match(/,/) && 
			checkDistance(subject.replace(/,/g, ""), guess, config.threshold)) {
			return true;
		}
		if (subject.match(/ & /) && !subject.match(/\(/) &&
			checkDistance(subject.replace(/ & /, " and "), guess, config.threshold)) {
			return true;
		}
		if (subject.match(/\(.+\)\??(?: \[.+\])?/)) {
			var normalized = subject.replace(/\(.+\)\??(?: \[.+\])?/, "")
									.replace(/^ +/, "").replace(/ +$/, "");
			if (checkDistance(normalized, guess, config.threshold)) {
				return true;
			}
			if (normalized.match(/ & /) && 
				checkDistance(normalized.replace(/ & /, " and "), guess, config.threshold)) {
				return true;
			}
		}
		if (subject.match(/, [pP]t\. [0-9]$/) && 
			checkDistance(subject.replace(/, [pP]t\. [0-9]$/, ""), guess, config.threshold)) {
			return true;
		}
	}
	return false;
};

var collectStats = function(username, stats) {
	var key = "user:"+username;
	if (stats.points) {
		usersdb.hincrby(key, "totpoints", stats.points);
	}
	if (stats.userscore) {
		// Set personal best
		usersdb.hget(key, "bestscore", function(err, res) {
			if (res < stats.userscore) {
				usersdb.hset(key, "bestscore", stats.userscore);
			}
		});
	}
	if (stats.gold) {
		usersdb.hincrby(key, "golds", 1);
	}
	if (stats.silver) {
		usersdb.hincrby(key, "silvers", 1);
	}
	if (stats.bronze) {
		usersdb.hincrby(key, "bronzes", 1);
	}
	if (stats.guesstime) {
		usersdb.hincrby(key, "guessed", 1);
		usersdb.hincrby(key, "totguesstime", stats.guesstime);
		usersdb.hget(key, "bestguesstime", function(err, res) {
			if (stats.guesstime < res) {
				usersdb.hset(key, "bestguesstime", stats.guesstime);
			}
		});
		usersdb.hget(key, "worstguesstime", function(err, res) {
			if (stats.guesstime > res) {
				usersdb.hset(key, "worstguesstime", stats.guesstime);
			}
		});
	}
	if (stats.firstplace) {
		usersdb.hincrby(key, "victories", 1);
	}
	if (stats.secondplace) {
		usersdb.hincrby(key, "secondplaces", 1);
	}
	if (stats.thirdplace) {
		usersdb.hincrby(key, "thirdplaces", 1);
	}
};

function Room(name) {

	var roomname = name;
	var totusers = 0;
	
	var usersData = Object.create(null);
	var playedtracks = Object.create(null); // Used to prevent the same song from playing twice in one game
	
	var artistName = null;
	var artistlcase = null;
	var trackName = null;
	var tracklcase = null;
	var collectionName = null;
	var previewUrl = null;
	var artworkUrl = null;
	var trackViewUrl = null;
	var finishline = 1;
	var allowedguess = false;
	var status = null;
	var songtimeleft = null; // Milliseconds
	var songcounter = 0;
	var trackscount = 0;

	this.getPopulation = function() {
		return totusers;
	};

	var addUser = function(socket, loggedin) {
		sockets[socket.nickname] = socket;
		usersData[socket.nickname] = {
			nickname: socket.nickname,
			registered: loggedin,
			points: 0,
			roundpoints: 0,
			matched: null,
			guessed: 0,
			guesstime: null,
			bestguesstime: 30000,
			golds: 0,
			silvers: 0,
			bronzes: 0
		};
		totusers = totusers + 1;
		io.sockets.in('home').emit('update', {room:roomname,players:totusers});
		// Broadcast new user event
		socket.emit('ready', {users:usersData,trackscount:trackscount,loggedin:loggedin});
		socket.broadcast.to(roomname).emit('newuser', {nickname:socket.nickname,users:usersData});
	};

	var removeUser = function(socket) {
		// Delete the references
		delete sockets[socket.nickname];
		delete usersData[socket.nickname];
		totusers = totusers - 1;
		io.sockets.in('home').emit('update', {room:roomname,players:totusers});
	};

	var userExists = function(nickname) {
		var user = usersData[nickname];
		if (user) {
			return true;
		}
		return false;
	};
	
	this.joinRoom = function(socket) {
		socket.roomname = roomname;
		socket.join(roomname);
		addUser(socket, true);
	}
	
	// A user requested an invalid name
	var invalidNickName = function(socket, feedback) {
		socket.emit('invalidnickname', feedback);
	};

	// A user is submitting a name
	this.setNickName = function(socket, data) {
		var feedback = null;
		if (data.nickname.length > 15) {
			feedback = '<span class="label label-important">That name is too long.</span>';
		}
		else if (data.nickname === "binb") {
			feedback = '<span class="label label-important">That name is reserved.</span>';
		}
		else if (getUserSocket(data.nickname)) {
			feedback = '<span class="label label-important">Name already taken.</span>';
		}
		if (feedback) {
			return invalidNickName(socket, feedback);
		}
		
		var key = "user:"+data.nickname;
		usersdb.exists(key, function(err, resp) {
			if (resp === 1) { // User already exists
				feedback = '<span class="label label-important">That name belongs '
				feedback += 'to a registered user.</span>';
				return invalidNickName(socket, feedback);
			}
			else {
				socket.nickname = data.nickname;
				socket.roomname = roomname;
				socket.join(roomname);
				// Add user to the list of active users
				addUser(socket, false);
			}
		});
	};

	// A user has left (DCed, etc.)
	this.userLeft = function(socket) {
		var leftname = socket.nickname;
		removeUser(socket);
		io.sockets.in(roomname).emit('userleft', {nickname:leftname,users:usersData});
	};
	
	this.sendChatMessage = function (socket, data) {
		if (typeof data === "string") {
			var datalcase = data.toLowerCase();
			if (allowedguess && (amatch(artistlcase, datalcase, true) || 
								amatch(tracklcase, datalcase))) {
				var msg = "You are probably right, but you have to use the box above.";
				socket.emit('chatmsg', {from:"binb",to:socket.nickname,chatmsg:msg});
				return;
			}
			io.sockets.in(roomname).emit('chatmsg', {from:socket.nickname,chatmsg:data});
		}
		else if (typeof data === "object" && typeof data.to === "string" && 
					userExists(data.to) && typeof data.chatmsg === "string") {
			// Private message
			socket.emit('chatmsg', {from:socket.nickname,to:data.to,chatmsg:data.chatmsg});
			var recipient = getUserSocket(data.to);
			recipient.emit('chatmsg', {from:socket.nickname,to:data.to,chatmsg:data.chatmsg});
		}
	};

	var addPoints = function(socket, allinone) {
		usersData[socket.nickname].guesstime = 30000 - songtimeleft;
		var stats = {};
		switch (finishline) {
			case 1:
				finishline++;
				usersData[socket.nickname].roundpoints = 6;
				if (allinone) {
					usersData[socket.nickname].points += 6;
					stats.points = 6;
				}
				else {
					usersData[socket.nickname].points += 5;
					stats.points = 5;
				}
				usersData[socket.nickname].golds++;
				stats.gold = true;
				break;
			case 2:
				finishline++;
				usersData[socket.nickname].roundpoints = 5;
				if (allinone) {
					usersData[socket.nickname].points += 5;
					stats.points = 5;
				}
				else {
					usersData[socket.nickname].points += 4;
					stats.points = 4;
				}
				usersData[socket.nickname].silvers++;
				stats.silver = true;
				break;
			case 3:
				finishline++;
				usersData[socket.nickname].roundpoints = 4;
				if (allinone) {
					usersData[socket.nickname].points += 4;
					stats.points = 4;
				}
				else {
					usersData[socket.nickname].points += 3;
					stats.points = 3;
				}
				usersData[socket.nickname].bronzes++;
				stats.bronze = true;
				break;
			default:
				usersData[socket.nickname].roundpoints = 3;
				if (allinone) {
					usersData[socket.nickname].points += 3;
					stats.points = 3;
				}
				else {
					usersData[socket.nickname].points += 2;
					stats.points = 2;
				}
		}
		usersData[socket.nickname].matched = 'both';
		usersData[socket.nickname].guessed++;
		if (usersData[socket.nickname].guesstime < usersData[socket.nickname].bestguesstime) {
			usersData[socket.nickname].bestguesstime = usersData[socket.nickname].guesstime;
		}
		if (usersData[socket.nickname].registered) {
			stats.userscore = usersData[socket.nickname].points;
			stats.guesstime = usersData[socket.nickname].guesstime;
			collectStats(socket.nickname, stats);
		}
	};
	
	this.guess = function(socket, guess) {
		if (allowedguess) {
			if (!usersData[socket.nickname].matched) { // No track no artist
				if ((artistlcase === tracklcase) && amatch(tracklcase, guess, true)) {
					addPoints(socket, true);
					socket.emit('bothmatched');
					io.sockets.in(roomname).emit('updateusers', {users:usersData});
				}
				else if (amatch(artistlcase, guess, true)) {
					usersData[socket.nickname].roundpoints++;
					usersData[socket.nickname].points++;
					usersData[socket.nickname].matched = 'artist';
					socket.emit('artistmatched');
					io.sockets.in(roomname).emit('updateusers', {users:usersData});
					if (usersData[socket.nickname].registered) {
						var stats = {points:1,userscore:usersData[socket.nickname].points};
						collectStats(socket.nickname, stats);
					}
				}
				else if (amatch(tracklcase, guess)) {
					usersData[socket.nickname].roundpoints++;
					usersData[socket.nickname].points++;
					usersData[socket.nickname].matched = 'title';
					socket.emit('titlematched');
					io.sockets.in(roomname).emit('updateusers', {users:usersData});
					if (usersData[socket.nickname].registered) {
						var stats = {points:1,userscore:usersData[socket.nickname].points};
						collectStats(socket.nickname, stats);
					}
				}
				else {
					socket.emit('nomatch');
				}
			}
			else if (usersData[socket.nickname].matched !== 'both') { // Track or artist
				if (usersData[socket.nickname].matched === 'artist') {
					if (amatch(tracklcase, guess)) {
						addPoints(socket, false);
						socket.emit('bothmatched');
						io.sockets.in(roomname).emit('updateusers', {users:usersData});
					}
					else {
						socket.emit('nomatch');
					}
				}
				else {
					if (amatch(artistlcase, guess, true)) {
						addPoints(socket, false);
						socket.emit('bothmatched');
						io.sockets.in(roomname).emit('updateusers', {users:usersData});
					}
					else {
						socket.emit('nomatch');
					}
				}
			}
			else { // The user has guessed both track and artist
				socket.emit('stoptrying');
			}
		}
		else {
			socket.emit('noguesstime');
		}
	};
	
	var resetPoints = function(roundonly) {
		for (var key in usersData) {
			if (!roundonly) {
				usersData[key].points = 0;
				usersData[key].guessed = 0;
				usersData[key].bestguesstime = 30000;
				usersData[key].golds = 0;
				usersData[key].silvers = 0;
				usersData[key].bronzes = 0;
			}
			usersData[key].roundpoints = 0;
			usersData[key].matched = null;
			usersData[key].guesstime = null;
		}
	};

	var sendLoadTrack = function() {
		songsdb.srandmember(roomname, function(err, res) {
			songsdb.hmget(res, "artistName", "trackName", "collectionName", "previewUrl",
							"artworkUrl60", "trackViewUrl", function(e, replies) {
				if (playedtracks[res]) {
					return sendLoadTrack();
				}
				playedtracks[res] = true;
				artistName = replies[0];
				artistlcase = artistName.toLowerCase();
				trackName = replies[1];
				tracklcase = trackName.toLowerCase();
				collectionName = replies[2];
				previewUrl = replies[3];
				artworkUrl = replies[4];
				trackViewUrl = replies[5];
				io.sockets.in(roomname).emit('loadtrack', {previewUrl:previewUrl});
				setTimeout(sendPlayTrack, 5000);
			});
		});
		status = 1; // Loading next song
	};

	var sendPlayTrack = function() {
		songcounter = songcounter + 1;
		status = 0; // Playing track
		io.sockets.in(roomname).emit('playtrack', {counter:songcounter,tot:config.songsinarun,
										users:usersData});
		songTimeLeft(Date.now()+30000, 50);
		allowedguess = true;
		setTimeout(sendTrackInfo, 30000);
	};
	
	var songTimeLeft = function(end, delay) {
		songtimeleft = end - Date.now();
		if (songtimeleft < delay) {
			return;
		}
		setTimeout(songTimeLeft, delay, end, delay);
	};
	
	var sendTrackInfo = function() {
		io.sockets.in(roomname).emit('trackinfo', {artworkUrl:artworkUrl,artistName:artistName,
										trackName:trackName,collectionName:collectionName,
										trackViewUrl:trackViewUrl});
		finishline = 1;
		allowedguess = false;
		if (songcounter < config.songsinarun) {
			resetPoints(true);
			sendLoadTrack();
		}
		else {
			status = 2; // Sending last track info
			setTimeout(gameOver, 5000);
		}
	};

	var gameOver = function() {
		status = 3; // Game over
		var users = [];
		for (var key in usersData) {
			users.push(usersData[key]);
		}
		users.sort(function(a, b) {return b.points - a.points;});
		var podium = users.slice(0,3);
		io.sockets.in(roomname).emit('gameover', {users:podium});
		if (podium[0] && podium[0].registered) {
			collectStats(podium[0].nickname, {firstplace:true});
		}
		if (podium[1] && podium[1].registered) {
			collectStats(podium[1].nickname, {secondplace:true});
		}
		if (podium[2] && podium[2].registered) {
			collectStats(podium[2].nickname, {thirdplace:true});
		}
		resetPoints(false);
		setTimeout(reset, 5000);
	};

	this.sendStatus = function(socket) {
		socket.emit('status', {status:status,timeleft:songtimeleft,previewUrl:previewUrl});
	};

	var reset = function() {
		songcounter = 0;
		playedtracks = Object.create(null);
		sendLoadTrack();
	};

	// Start the room
	this.start = function() {
		songsdb.scard(roomname, function(err, res) {
			trackscount = res;
		});
		sendLoadTrack();
	};
}

var Rooms = Object.create(null);
for (var i=0; i<config.rooms.length; i++) {
	Rooms[config.rooms[i]] = new Room(config.rooms[i]);
	Rooms[config.rooms[i]].start();
}

console.log("binb started and listening on port "+config.port);
