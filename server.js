var async = require("async");
var express = require("express");
var http = express.createServer();

// Configuration
var config = require("./config.js").configure();
http.use(express.static(__dirname + '/public'));
http.set("view options", {layout:false});
http.set('view engine', 'jade');

// Routes
http.get("/", function(req, res) {
	res.render("index", {rooms:config.rooms});
});

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

http.get("/:room", function(req, res, next) {
	if (config.rooms.indexOf(req.params.room) !== -1) {
		res.render("room", {roomname:req.params.room,rooms:config.rooms});
	}
	else {
		next();
	}
});

// Starting HTTP server
http.listen(config.port);

// Setting up Redis
var redis = require("redis-url").createClient(config.redisurl);

redis.on('error', function(err) {
	console.log("Error: "+err);
});

// Setting up Socket.IO
var io = require("socket.io").listen(http);

io.enable('browser client minification');	// send minified client
io.enable('browser client etag');			// apply etag caching logic based on version number
io.enable('browser client gzip');			// gzip the file
io.set('log level', 1);						// reduce logging
// enable transports
io.set('transports', ['websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);

var makeCallBack = function(genre) {
	return function(callback) {
		redis.srandmember(genre, function(err, res) {
			redis.hget(res, "artworkUrl100", callback);
		});
	};
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
		if (subject.match(/^the /) && 
			checkDistance(subject.replace(/^the /, ""), guess, config.threshold)) {
			return true;
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
		if (subject.match(/\(.+\)\??(?: \[.+\])?/) && checkDistance(
			subject.replace(/\(.+\)\??(?: \[.+\])?/, "").replace(/^ +/, "").replace(/ +$/, ""), 
			guess, config.threshold)) {
			return true;
		}
		if (subject.match(/, [pP]t\. [0-9]$/) && 
			checkDistance(subject.replace(/, [pP]t\. [0-9]$/, ""), guess, config.threshold)) {
			return true;
		}
	}
	return false;
};

function Room(name) {

	var roomname = name;
	var totusers = 0;
	
	var sockets = Object.create(null);
	var usersData = Object.create(null);
	var playedtracks = []; // Used to prevent the same song from playing twice in one game
	
	var artistName = null;
	var artistlcase = null;
	var trackName = null;
	var tracklcase = null;
	var collectionName = null;
	var previewUrl = null;
	var artworkUrl = null;
	var trackViewUrl = null;
	var finishline = 1;
	var guesstime = false;
	var status = null;
	var songtimeleft = null; // Milliseconds
	var songcounter = 0;
	var trackscount = 0;

	this.getPopulation = function() {
		return totusers;
	};

	var addUser = function(socket) {
		sockets[socket.nickname] = socket;
		usersData[socket.nickname] = {
			nickname: socket.nickname,
			points: 0,
			roundpoints: 0,
			matched: null
		};
		totusers = totusers + 1;
		io.sockets.in('home').emit('update', {room:roomname,players:totusers});
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

	var getUserSocket = function(nickname) {
		return sockets[nickname];
	};
	
	// A user requested an invalid name
	var invalidNickName = function(socket, feedback) {
		socket.emit('invalidnickname', feedback);
	};

	// A user is submitting a name
	this.setNickName = function(socket, data) {
		var feedback = null;
		if (data.nickname.length > 18) {
			feedback = '<span class="label label-important">That name is too long.</span>';
		}
		else if (data.nickname === "Binb") {
			feedback = '<span class="label label-important">That name is reserved.</span>';
		}
		else if (userExists(data.nickname)) {
			feedback = '<span class="label label-important">That name is alredy taken.</span>';
		}
		if (feedback) {
			return invalidNickName(socket, feedback);
		}

		socket.nickname = data.nickname;
		socket.roomname = roomname;
		socket.join(roomname);
		
		// Add user to the list of active users and broadcast the event
		addUser(socket);
		socket.emit('ready', {users:usersData,trackscount:trackscount});
		socket.broadcast.to(roomname).emit('newuser', {nickname:socket.nickname,users:usersData});
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
			if (guesstime && (amatch(artistlcase, datalcase, true) || 
								amatch(tracklcase, datalcase))) {
				var msg = "You are probably right, but you have to use the box above.";
				socket.emit('chatmsg', {from:"Binb",to:socket.nickname,chatmsg:msg});
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
		usersData[socket.nickname].matched = 'both';
		switch (finishline) {
			case 1:
				finishline++;
				usersData[socket.nickname].roundpoints = 6;
				usersData[socket.nickname].points += (allinone) ? 6 : 5;
				break;
			case 2:
				finishline++;
				usersData[socket.nickname].roundpoints = 5;
				usersData[socket.nickname].points += (allinone) ? 5 : 4;
				break;
			case 3:
				finishline++;
				usersData[socket.nickname].roundpoints = 4;
				usersData[socket.nickname].points += (allinone) ? 4 : 3;
				break;
			default:
				usersData[socket.nickname].roundpoints = 3;
				usersData[socket.nickname].points += (allinone) ? 3 : 2;
		}
	};
	
	this.guess = function(socket, guess) {
		if (guesstime) {
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
				}
				else if (amatch(tracklcase, guess)) {
					usersData[socket.nickname].roundpoints++;
					usersData[socket.nickname].points++;
					usersData[socket.nickname].matched = 'title';
					socket.emit('titlematched');
					io.sockets.in(roomname).emit('updateusers', {users:usersData});
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
			}
			usersData[key].roundpoints = 0;
			usersData[key].matched = null;
		}
	};

	var sendLoadTrack = function() {
		redis.srandmember(roomname, function(err, res) {
			redis.hmget(res, "trackId", "artistName", "trackName", "collectionName", "previewUrl",
							"artworkUrl60", "trackViewUrl", function(e, replies) {
				if (playedtracks[replies[0]]) {
					return sendLoadTrack();
				}
				playedtracks[replies[0]] = true;
				artistName = replies[1];
				artistlcase = artistName.toLowerCase();
				trackName = replies[2];
				tracklcase = trackName.toLowerCase();
				collectionName = replies[3];
				previewUrl = replies[4];
				artworkUrl = replies[5];
				trackViewUrl = replies[6];
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
		guesstime = true;
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
		guesstime = false;
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
		io.sockets.in(roomname).emit('gameover', {users:usersData});
		resetPoints(false);
		setTimeout(reset, 5000);
	};

	this.sendStatus = function(socket) {
		socket.emit('status', {status:status,timeleft:songtimeleft,
								previewUrl:previewUrl});
	};

	var reset = function() {
		songcounter = 0;
		playedtracks = [];
		sendLoadTrack();
	};

	// Start the room
	this.start = function() {
		redis.scard(roomname, function(err, res) {
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

console.log("Bimb started and listening on port "+config.port);

io.sockets.on('connection', function(socket) {
	socket.on('getoverview', function() {
		var data = Object.create(null);
		for (var prop in Rooms) {
			data[prop] = Rooms[prop].getPopulation();
		}
		socket.join('home');
		socket.emit('overview', data);
	});
	socket.on('joinroom', function(data) {
		if (!socket.nickname && typeof data === "object" && typeof data.nickname === "string" &&
			data.nickname !== "" && typeof data.roomname === "string" && 
			config.rooms.indexOf(data.roomname) !== -1) {
			Rooms[data.roomname].setNickName(socket, data);
		}
	});
	socket.on('getstatus', function() {
		Rooms[socket.roomname].sendStatus(socket);
	});
	socket.on('sendchatmsg', function(data) {
		Rooms[socket.roomname].sendChatMessage(socket, data);
	});
	socket.on('guess', function(data) {
		if (typeof data === "string") {
			Rooms[socket.roomname].guess(socket, data);
		}
	});
	socket.on("disconnect", function() {
		if (socket.nickname !== undefined) {
			Rooms[socket.roomname].userLeft(socket);
		}
	});
});
