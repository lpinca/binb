var express = require("express");
var http = express.createServer();

// Configuration
var config = require("./config.js").configure();
http.use(express.static(__dirname + '/public'));
http.use(express.bodyParser());
http.set("view options", { layout: false });

// Routes
http.get("/", function(req, res) {
    res.sendfile("index.html");
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

io.enable('browser client minification');  // send minified client
io.enable('browser client etag');          // apply etag caching logic based on version number
io.enable('browser client gzip');          // gzip the file
io.set('log level', 1);                    // reduce logging
// enable transports
io.set('transports', ['websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);

var Game = {

	sockets : Object.create(null),
	usersData : Object.create(null),
	playedtracks: [],	// Used to prevent the same song from playing twice in one game
	
	artistName: null,
	trackName: null,	
    collectionName: null,
	previewUrl: null,
	artworkUrl: null,
	trackViewUrl: null,
	finishline: 1,
	guesstime: false,
	status: null,
	songtimeleft: null, // Milliseconds
	songcounter: 0,
	trackscount: 0,

	addUser : function(socket) {
		Game.sockets[socket.nickname] = socket;
		Game.usersData[socket.nickname] = {
			nickname:socket.nickname,
			points:0,
			roundpoints:0,
			matched:null
		};
	},

	removeUser : function(socket) {
		// Delete the references
		delete Game.sockets[socket.nickname];
		delete Game.usersData[socket.nickname];
	},

	userExists : function(nickname) {
		var user = Game.usersData[nickname];
		if (user) {
			return true;
		}
		return false;
	},

	getUserSocket : function(nickname) {
		return Game.sockets[nickname];
	},

	// A user is submitting a name
	setNickName: function(socket, data) {
        var feedback = null;
        if (Game.userExists(data.nickname)) {
            feedback = '<span class="label label-important">That name is alredy taken.</span>';
		}
        if (feedback) {
            return Game.invalidNickName(socket, feedback);
		}

        socket.nickname = data.nickname;
		
		// Add user to the list of active users and broadcast the event
		Game.addUser(socket);
		socket.emit('ready', {users:Game.usersData,trackscount:Game.trackscount});
		socket.broadcast.emit('newuser', {nickname:socket.nickname,users:Game.usersData});
    },

	// A user requested an invalid name
    invalidNickName: function(socket, feedback) {
		socket.emit('invalidnickname', {feedback:feedback});
    },

	// A user has left (DCed, etc.)
    userLeft: function(socket) {
		if (socket.nickname !== undefined) {
			var leftname = socket.nickname;
			Game.removeUser(socket);
			io.sockets.emit('userleft', {nickname:leftname,users:Game.usersData});
		}
    },
	
	sendChatMessage: function (socket, data) {
		if (data.to) {
			// Private message
			socket.emit('chatmsg', {from:data.from,to:data.to,chatmsg:data.chatmsg});
			var recipient = Game.getUserSocket(data.to);
			recipient.emit('chatmsg', {from:data.from,to:data.to,chatmsg:data.chatmsg});
			return;
		}
		io.sockets.emit('chatmsg', {from:data.from,chatmsg:data.chatmsg});
	},

	addPoints: function(socket, allinone) {
		Game.usersData[socket.nickname].matched = 'both';
		switch (Game.finishline) {
			case 1:
				Game.finishline++;
				Game.usersData[socket.nickname].roundpoints = 6;
				Game.usersData[socket.nickname].points += (allinone) ? 6 : 5;
				break;
			case 2:
				Game.finishline++;
				Game.usersData[socket.nickname].roundpoints = 5;
				Game.usersData[socket.nickname].points += (allinone) ? 5 : 4;
				break;
			case 3:
				Game.finishline++;
				Game.usersData[socket.nickname].roundpoints = 4;
				Game.usersData[socket.nickname].points += (allinone) ? 4 : 3;
				break;
			default:
				Game.usersData[socket.nickname].roundpoints = 3;
				Game.usersData[socket.nickname].points += (allinone) ? 3 : 2;
		}
	},
	
	guess: function(socket, data) {
		if (Game.guesstime) {
			var artistname = Game.artistName.toLowerCase();
			var trackname = Game.trackName.toLowerCase();
			if (!Game.usersData[socket.nickname].matched) { // No track no artist
				if ((artistname === trackname) && Game.amatch(trackname, data.guess, true)) {
					Game.addPoints(socket, true);
					socket.emit('bothmatched');
					io.sockets.emit('updateusers', {users:Game.usersData});
				}
				else if (Game.amatch(artistname, data.guess, true)) {
					Game.usersData[socket.nickname].roundpoints++;
					Game.usersData[socket.nickname].points++;
					Game.usersData[socket.nickname].matched = 'artist';
					socket.emit('artistmatched');
					io.sockets.emit('updateusers', {users:Game.usersData});
				}
				else if (Game.amatch(trackname, data.guess)) {
					Game.usersData[socket.nickname].roundpoints++;
					Game.usersData[socket.nickname].points++;
					Game.usersData[socket.nickname].matched = 'title';
					socket.emit('titlematched');
					io.sockets.emit('updateusers', {users:Game.usersData});
				}
				else {
					socket.emit('nomatch');
				}
			}
			else if (Game.usersData[socket.nickname].matched !== 'both') { // Track or artist
				if (Game.usersData[socket.nickname].matched === 'artist') {
					if (Game.amatch(trackname, data.guess)) {
						Game.addPoints(socket, false);
						socket.emit('bothmatched');
						io.sockets.emit('updateusers', {users:Game.usersData});
					}
					else {
						socket.emit('nomatch');
					}
				}
				else {
					if (Game.amatch(artistname, data.guess, true)) {
						Game.addPoints(socket, false);
						socket.emit('bothmatched');
						io.sockets.emit('updateusers', {users:Game.usersData});
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
	},

	amatch: function(subject, guess, enableartistrules) {
		if (Game.ld(subject,guess) <= 2) {
			return true;
		}
		var splitted, trimmed;
		if (subject.match(/\./) && (Game.ld(subject.replace(/\./g, ""), guess) <= 2)) {
			return true;
		}
		if (!enableartistrules && subject.match(/,/) && (Game.ld(subject.replace(/,/g, ""), guess) <= 2)) {
			return true;
		}
		if (subject.match(/\-/) && (Game.ld(subject.replace(/\-/g, ""), guess) <= 2)) {
			return true;
		}
		if (enableartistrules) {
			if (subject.match(/^the /) && (Game.ld(subject.replace(/^the /, ""), guess) <= 2)) {
				return true;
			}
			splitted = subject.split("&");
			if (splitted.length !== 1) {
				for (var i=0; i<splitted.length; i++) {
					trimmed = splitted[i].replace(/^ +/, "").replace(/ +$/, "");
					if (Game.ld(trimmed, guess) <= 2) {
						return true;
					}
					if (trimmed.match(/^the /) && 
						(Game.ld(trimmed.replace(/^the /, ""), guess) <= 2)) {
						return true;
					}
				}
			}
		}
		splitted = subject.split("(");
		if (splitted.length !== 1) {
			trimmed = splitted[0].replace(/ +$/, "");
			if (Game.ld(trimmed, guess) <= 2) {
				return true;
			}
		}
		return false;
	},

	// Compute the Levenshtein distance between two strings
	ld: function(s1, s2) {
		var d = [];
		for (var i=0; i <= s1.length; i++) {
			d[i] = []; // Now d is a matrix with s1.length + 1 rows
			d[i][0] = i;
		}
		for (var j=0; j <= s2.length; j++) {
			d[0][j] = j;
		}
		for (i=1; i <= s1.length; i++) {
			for (j=1; j<=s2.length; j++) {
				if (s1.charAt(i-1) === s2.charAt(j-1)) {
					d[i][j] = d[i-1][j-1];
				}
				else {
					d[i][j] = Math.min(d[i][j-1]+1, d[i-1][j-1]+1, d[i-1][j]+1);
				}
			}
		}
		return d[s1.length][s2.length];
	},
	
	resetPoints: function(roundonly) {
		for (var key in Game.usersData) {
			if (!roundonly) {
				Game.usersData[key].points = 0;
			}
			Game.usersData[key].roundpoints = 0;
			Game.usersData[key].matched = null;
		}
	},

	sendLoadTrack: function() {
		redis.srandmember("songs", function(err, res) {
			redis.hmget(res, "trackId", "artistName", "trackName", "collectionName", "previewUrl",
							"artworkUrl60", "trackViewUrl", function(e, replies) {
				if (Game.playedtracks[replies[0]]) {
					return Game.sendLoadTrack();
				}
				Game.playedtracks[replies[0]] = true;
				Game.artistName = replies[1];
				Game.trackName = replies[2]; 
				Game.collectionName = replies[3];
				Game.previewUrl = replies[4];
				Game.artworkUrl = replies[5];
				Game.trackViewUrl = replies[6];
				io.sockets.emit('loadtrack', {previewUrl:Game.previewUrl});
				setTimeout(Game.sendPlayTrack, 5000);
			});
		});
		Game.status = 1; // Loading next song
	},

	sendPlayTrack: function() {
		Game.songcounter = Game.songcounter + 1;
		Game.status = 0; // Playing track
		io.sockets.emit('playtrack', {counter:Game.songcounter,tot:config.songsinarun,
										users:Game.usersData});
		Game.songTimeLeft(Date.now()+30000, 50);
		Game.guesstime = true;
		setTimeout(Game.sendTrackInfo, 30000);
	},
	
	songTimeLeft: function(end, delay) {
		Game.songtimeleft = end - Date.now();
		if (Game.songtimeleft < delay) {
			return;
		}
		setTimeout(Game.songTimeLeft, delay, end, delay);
	},
	
	sendTrackInfo: function() {
		io.sockets.emit('trackinfo', {artworkUrl:Game.artworkUrl,artistName:Game.artistName,
										trackName:Game.trackName,collectionName:Game.collectionName,
										trackViewUrl:Game.trackViewUrl});
		Game.finishline = 1;
		Game.guesstime = false;
		if (Game.songcounter < config.songsinarun) {
			Game.resetPoints(true);
			Game.sendLoadTrack();
		}
		else {
			Game.status = 2; // Sending last track info
			setTimeout(Game.gameOver, 5000);
		}
	},

	gameOver: function() {
		Game.status = 3; // Game over
		io.sockets.emit('gameover', {users:Game.usersData});
		Game.resetPoints(false);
		setTimeout(Game.reset, 5000);
	},

	sendStatus: function(socket) {
		socket.emit('status', {status:Game.status,timeleft:Game.songtimeleft,
								previewUrl:Game.previewUrl});
	},

	reset: function() {
		Game.songcounter = 0;
		Game.playedtracks = [];
		Game.sendLoadTrack();
	},

	// Start the game
	start: function() {
		redis.scard("songs", function(err, res) {
			Game.trackscount = res;
		});
		console.log("Bimb started and listeing on port "+config.port);
		Game.sendLoadTrack();
	}
};

Game.start();

io.sockets.on("connection", function(socket) {
	socket.on('setnickname', function(data) {
		Game.setNickName(socket, data);
	});
	socket.on('getstatus', function() {
		Game.sendStatus(socket);
	});
	socket.on('sendchatmsg', function(data) {
		Game.sendChatMessage(socket, data);
	});
	socket.on('guess', function(data) {
		Game.guess(socket, data);
	});
    socket.on("disconnect", function() {
        Game.userLeft(socket);
    });
});
