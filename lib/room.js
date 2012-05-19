module.exports = function(params) {

	var songsdb = params.songsdb;
	var usersdb = params.usersdb;
	var io = params.io;
	var sockets = params.sockets;
	var songsinarun = params.songsinarun;
	var fifolength = params.fifolength;
	var threshold = params.threshold;

	var amatch = require('./match.js')(threshold);
	var collectStats = require('./stats.js')(usersdb);

	function Room(roomname) {

		var roomname = roomname;
		var totusers = 0;
	
		var usersData = Object.create(null);
		var playedtracks = []; // The list of already played songs
	
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
				totguesstime: 0,
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

		var removeUser = function(nickname) {
			// Delete the references
			delete sockets[nickname];
			delete usersData[nickname];
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
		};
	
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
			else if (sockets[data.nickname]) {
				feedback = '<span class="label label-important">Name already taken.</span>';
			}
			if (feedback) {
				return invalidNickName(socket, feedback);
			}
		
			var key = "user:"+data.nickname;
			usersdb.exists(key, function(err, resp) {
				if (resp === 1) { // User already exists
					feedback = '<span class="label label-important">That name belongs ';
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
		this.userLeft = function(nickname) {
			removeUser(nickname);
			io.sockets.in(roomname).emit('userleft', {nickname:nickname,users:usersData});
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
				var recipient = sockets[data.to];
				recipient.emit('chatmsg', {from:socket.nickname,to:data.to,chatmsg:data.chatmsg});
			}
		};

		var addPoints = function(nickname, allinone) {
			usersData[nickname].guesstime = 30000 - songtimeleft;
			var stats = {};
			switch (finishline) {
				case 1:
					finishline++;
					usersData[nickname].roundpoints = 6;
					if (allinone) {
						usersData[nickname].points += 6;
						stats.points = 6;
					}
					else {
						usersData[nickname].points += 5;
						stats.points = 5;
					}
					usersData[nickname].golds++;
					stats.gold = true;
					break;
				case 2:
					finishline++;
					usersData[nickname].roundpoints = 5;
					if (allinone) {
						usersData[nickname].points += 5;
						stats.points = 5;
					}
					else {
						usersData[nickname].points += 4;
						stats.points = 4;
					}
					usersData[nickname].silvers++;
					stats.silver = true;
					break;
				case 3:
					finishline++;
					usersData[nickname].roundpoints = 4;
					if (allinone) {
						usersData[nickname].points += 4;
						stats.points = 4;
					}
					else {
						usersData[nickname].points += 3;
						stats.points = 3;
					}
					usersData[nickname].bronzes++;
					stats.bronze = true;
					break;
				default:
					usersData[nickname].roundpoints = 3;
					if (allinone) {
						usersData[nickname].points += 3;
						stats.points = 3;
					}
					else {
						usersData[nickname].points += 2;
						stats.points = 2;
					}
			}
			usersData[nickname].matched = 'both';
			usersData[nickname].guessed++;
			usersData[nickname].totguesstime += usersData[nickname].guesstime;

			if (usersData[nickname].registered) {
				stats.userscore = usersData[nickname].points;
				stats.guesstime = usersData[nickname].guesstime;
				collectStats(nickname, stats);
			}
		};
	
		this.guess = function(socket, guess) {
			if (allowedguess) {
				if (!usersData[socket.nickname].matched) { // No track no artist
					if ((artistlcase === tracklcase) && amatch(tracklcase, guess, true)) {
						addPoints(socket.nickname, true);
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
							addPoints(socket.nickname, false);
							socket.emit('bothmatched');
							io.sockets.in(roomname).emit('updateusers', {users:usersData});
						}
						else {
							socket.emit('nomatch');
						}
					}
					else {
						if (amatch(artistlcase, guess, true)) {
							addPoints(socket.nickname, false);
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
					usersData[key].totguesstime = 0;
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
					if (playedtracks.indexOf(res) !== -1) {
						return sendLoadTrack();
					}
					playedtracks.push(res);
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
			io.sockets.in(roomname).emit('playtrack', {counter:songcounter,tot:songsinarun,
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
			if (songcounter < songsinarun) {
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
			if (playedtracks.length === fifolength) {
				playedtracks.splice(0, songsinarun);
			}
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

	return Room;
};
