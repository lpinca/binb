/**
 * Expose the `Room` class.
 */

module.exports = function(params) {

    /**
     * Room dependencies.
     */

    var amatch = require('./match')(params.threshold)
        , collectStats = require('./stats')(params.usersdb)
        , fifolength = params.fifolength
        , io = params.io
        , sockets = params.sockets
        , songsdb = params.songsdb
        , songsinarun = params.songsinarun
        , usersdb = params.usersdb;

    /**
     * Room class.
     */

    function Room(roomname) {

        var allowedguess = false
            , artist // Artists in lowercase
            , artistName
            , artworkUrl
            , collectionName
            , feat // Featured artists
            , finishline = 1
            , playedtracks = [] // The list of already played songs
            , previewUrl
            , songcounter = 0
            , songtimeleft // Milliseconds
            , status
            , title // Title in lowercase
            , trackName
            , trackscount = 0
            , trackViewUrl
            , totusers = 0
            , usersData = Object.create(null);

        // User points and statistics
        var addPointsAndStats = function(nickname, allinone) {
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

        // Add a new user in the room
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
            totusers++;
            // Broadcast new user event
            io.sockets.emit('updateoverview', roomname, totusers);
            socket.emit('ready', usersData, trackscount, loggedin);
            socket.broadcast.to(roomname).emit('newuser', socket.nickname, usersData);
        };

        var gameOver = function() {
            status = 3; // Game over

            // Build podium
            var users = [];
            for (var key in usersData) {
                users.push(usersData[key]);
            }
            users.sort(function(a, b) {return b.points - a.points;});
            var podium = users.slice(0,3);
            io.sockets.in(roomname).emit('gameover', podium);

            // Collect podium stats
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
            songcounter = 0;
            // Check if FIFO is full
            if (playedtracks.length === fifolength) {
                playedtracks.splice(0, songsinarun);
            }

            // Start a new game
            setTimeout(sendLoadTrack, 5000);
        };

        // Return the number of users in the room
        this.getPopulation = function() {
            return totusers;
        };

        // A user is sending a guess
        this.guess = function(socket, guess) {
            if (allowedguess) {
                if (!usersData[socket.nickname].matched) { // No track no artist
                    if ((artist === title) && amatch(title, guess, true)) {
                        addPointsAndStats(socket.nickname, true);
                        socket.emit('bothmatched');
                        io.sockets.in(roomname).emit('updateusers', usersData);
                    }
                    else if (amatch(artist, guess, true) || (feat && amatch(feat, guess, true))) {
                        usersData[socket.nickname].roundpoints++;
                        usersData[socket.nickname].points++;
                        usersData[socket.nickname].matched = 'artist';
                        socket.emit('artistmatched');
                        io.sockets.in(roomname).emit('updateusers', usersData);
                        if (usersData[socket.nickname].registered) {
                            var stats = {points:1,userscore:usersData[socket.nickname].points};
                            collectStats(socket.nickname, stats);
                        }
                    }
                    else if (amatch(title, guess)) {
                        usersData[socket.nickname].roundpoints++;
                        usersData[socket.nickname].points++;
                        usersData[socket.nickname].matched = 'title';
                        socket.emit('titlematched');
                        io.sockets.in(roomname).emit('updateusers', usersData);
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
                        if (amatch(title, guess)) {
                            addPointsAndStats(socket.nickname, false);
                            socket.emit('bothmatched');
                            io.sockets.in(roomname).emit('updateusers', usersData);
                        }
                        else {
                            socket.emit('nomatch');
                        }
                    }
                    else {
                        if (amatch(artist, guess, true) || (feat && amatch(feat, guess, true))) {
                            addPointsAndStats(socket.nickname, false);
                            socket.emit('bothmatched');
                            io.sockets.in(roomname).emit('updateusers', usersData);
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

        this.ignore = function(baduser, executor, callback) {
            // Check if the player to be ignored is in the room
            if (usersData[baduser]) {
                // Inform the bad player that he/she is being ignored
                var recipient = sockets[baduser];
                recipient.emit('chatmsg', executor+' is ignoring you.', 'binb', baduser);
                return callback(baduser);
            }
            callback(false);
        };

        this.joinRoom = function(socket) {
            socket.roomname = roomname;
            socket.join(roomname);
            addUser(socket, true);
        };

        // A user has left (DCed, etc.)
        this.removeUser = function(nickname) {
            // Delete the references
            delete sockets[nickname];
            delete usersData[nickname];
            totusers--;
            // Broadcast the event
            io.sockets.emit('updateoverview', roomname, totusers);
            io.sockets.in(roomname).emit('userleft', nickname, usersData);
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

        // A user is sending a chat message
        this.sendChatMessage = function(msg, socket, to) {
            if (typeof to === 'string') {
                // Check if the recipient is in the room
                if (usersData[to]) {
                    socket.emit('chatmsg', msg, socket.nickname, to);
                    var recipient = sockets[to];
                    recipient.emit('chatmsg', msg, socket.nickname, to);
                }
                return;
            }
            // Censor answers from chat
            var msglcase = msg.toLowerCase();
            if (allowedguess && (amatch(artist, msglcase, true) ||
                    (feat && amatch(feat, msglcase, true)) || amatch(title, msglcase))) {
                var notice = 'You are probably right, but you have to use the box above.';
                socket.emit('chatmsg', notice, 'binb', socket.nickname);
                return;
            }
            io.sockets.in(roomname).emit('chatmsg', msg, socket.nickname);
        };

        // Extract a random track from the database and send the load event
        var sendLoadTrack = function() {
            songsdb.srandmember(roomname, function(err, res) {
                // Check if extracted track is in the list of already played tracks
                if (playedtracks.indexOf(res) !== -1) {
                    return sendLoadTrack();
                }
                playedtracks.push(res);
                songsdb.hmget('song:'+res, 'artistName', 'trackName', 'collectionName', 'previewUrl',
                        'artworkUrl60', 'trackViewUrl', function(e, replies) {
                    artistName = replies[0];
                    artist = artistName.toLowerCase();
                    trackName = replies[1];
                    title = trackName.toLowerCase();
                    feat = /feat\. (.+?)[)\]]/.test(title) ? RegExp.$1 : null;
                    collectionName = replies[2];
                    previewUrl = replies[3];
                    artworkUrl = replies[4];
                    trackViewUrl = replies[5];
                    io.sockets.in(roomname).emit('loadtrack', previewUrl);
                    setTimeout(sendPlayTrack, 5000);
                });
            });
            status = 1; // Loading next song
        };

        var sendPlayTrack = function() {
            songcounter++;
            status = 0; // Playing track
            var data = {
                counter: songcounter,
                tot: songsinarun,
                users: usersData
            };
            io.sockets.in(roomname).emit('playtrack', data);
            songTimeLeft(Date.now() + 30000, 50);
            allowedguess = true;
            setTimeout(sendTrackInfo, 30000);
        };

        // Send the room status
        this.sendStatus = function(callback) {
            var data = {
                status: status,
                timeleft: songtimeleft,
                previewUrl: previewUrl
            };
            callback(data);
        };

        var sendTrackInfo = function() {
            var trackinfo = {
                artworkUrl: artworkUrl,
                artistName: artistName,
                trackName: trackName,
                trackViewUrl: trackViewUrl,
                collectionName: collectionName
            };
            io.sockets.in(roomname).emit('trackinfo', trackinfo);
            finishline = 1;
            allowedguess = false;

            if (songcounter < songsinarun) {
                resetPoints(true);
                sendLoadTrack();
                return;
            }

            status = 2; // Sending last track info
            setTimeout(gameOver, 5000);
        };

        // A user is submitting a name
        this.setNickName = function(socket, nickname) {
            var feedback = null;

            if (nickname.length > 15) {
                feedback = '<span class="label label-important">That name is too long.</span>';
            }
            else if (nickname === 'binb') {
                feedback = '<span class="label label-important">That name is reserved.</span>';
            }
            else if (sockets[nickname]) {
                feedback = '<span class="label label-important">Name already taken.</span>';
            }

            if (feedback) {
                return socket.emit('invalidnickname', feedback);
            }

            // Check if requested nickname belong to a registered user
            var key = 'user:'+nickname;
            usersdb.exists(key, function(err, resp) {
                if (resp === 1) {
                    feedback = '<span class="label label-important">That name belongs ';
                    feedback += 'to a registered user.</span>';
                    return socket.emit('invalidnickname', feedback);
                }
                socket.nickname = nickname;
                socket.roomname = roomname;
                socket.join(roomname);
                addUser(socket, false);
            });
        };

        // Timer for the playing song
        var songTimeLeft = function(end, delay) {
            songtimeleft = end - Date.now();
            if (songtimeleft < delay) {
                return;
            }
            setTimeout(songTimeLeft, delay, end, delay);
        };

        // Start the room
        this.start = function() {
            songsdb.scard(roomname, function(err, res) {
                trackscount = res;
            });
            sendLoadTrack();
        };

        this.unignore = function(baduser, executor) {
            if (usersData[baduser]) {
                // Inform the wicked player that he/she is no longer ignored
                var recipient = sockets[baduser];
                var notice = executor+' has stopped ignoring you.';
                recipient.emit('chatmsg', notice, 'binb', baduser);
            }
        };
    }

    return Room;
};
