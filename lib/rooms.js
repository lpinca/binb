/**
 * Module dependencies.
 */

var amatch = require('./match')
  , clients = require('./redis-clients')
  , collectStats = require('./stats')
  , config = require('../config')
  , fifolength = config.songsinarun * config.gameswithnorepeats
  , primus
  , randInt = require('./prng').randInt
  , rooms = {} // The Object that contains all the room instances
  , songsdb = clients.songs
  , sparks
  , usersdb = clients.users
  , utils = require('./utils')
  , isString = utils.isString
  , isUsername = utils.isUsername;

/**
 * Expose a function to set up the rooms.
 */

module.exports = function(options) {
  var refs = require('./sparks')(options);
  primus = refs.primus;
  sparks = refs.sparks;
  config.rooms.forEach(function(room) {
    room = rooms[room] = new Room(room);
    room.start();
  });
};

module.exports.rooms = rooms;

/**
 * Room constructor.
 */

function Room(roomname) {

  var artist // Artists in lowercase
    , artistName
    , artworkUrl
    , feat // Featured artists
    , finishline = 1
    , playedtracks = [] // The list of already played songs
    , previewUrl
    , songcounter = 0
    , songtimeleft // Milliseconds
    , status
    , title // Title in lowercase
    , trackName
    , trackViewUrl
    , trackscount // Number of tracks in the room
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
  var addUser = function(spark, loggedin) {
    sparks[spark.nickname] = spark;
    usersData[spark.nickname] = {
      nickname: spark.nickname,
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
    primus.send('updateoverview', roomname, totusers);
    spark.send('ready', usersData, trackscount, loggedin);
    spark.room(roomname).send('newuser', spark.nickname, usersData);
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
    primus.room(roomname).send('gameover', podium);

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
      playedtracks.splice(0, config.songsinarun);
    }

    // Start a new game
    setTimeout(sendLoadTrack, 5000);
  };

  // Return the number of users in the room
  this.getPopulation = function() {
    return totusers;
  };

  // A user is sending a guess
  this.guess = function(spark, guess) {
    if (status === 0) {
      if (!usersData[spark.nickname].matched) { // No track no artist
        if ((artist === title) && amatch(title, guess, true)) {
          addPointsAndStats(spark.nickname, true);
          spark.send('bothmatched');
          primus.room(roomname).send('updateusers', usersData);
        }
        else if (amatch(artist, guess, true) || (feat && amatch(feat, guess, true))) {
          usersData[spark.nickname].roundpoints++;
          usersData[spark.nickname].points++;
          usersData[spark.nickname].matched = 'artist';
          spark.send('artistmatched');
          primus.room(roomname).send('updateusers', usersData);
          if (usersData[spark.nickname].registered) {
            var stats = {points:1,userscore:usersData[spark.nickname].points};
            collectStats(spark.nickname, stats);
          }
        }
        else if (amatch(title, guess)) {
          usersData[spark.nickname].roundpoints++;
          usersData[spark.nickname].points++;
          usersData[spark.nickname].matched = 'title';
          spark.send('titlematched');
          primus.room(roomname).send('updateusers', usersData);
          if (usersData[spark.nickname].registered) {
            var stats = {points:1,userscore:usersData[spark.nickname].points};
            collectStats(spark.nickname, stats);
          }
        }
        else {
          spark.send('nomatch');
        }
      }
      else if (usersData[spark.nickname].matched !== 'both') { // Track or artist
        if (usersData[spark.nickname].matched === 'artist') {
          if (amatch(title, guess)) {
            addPointsAndStats(spark.nickname, false);
            spark.send('bothmatched');
            primus.room(roomname).send('updateusers', usersData);
          }
          else {
            spark.send('nomatch');
          }
        }
        else {
          if (amatch(artist, guess, true) || (feat && amatch(feat, guess, true))) {
            addPointsAndStats(spark.nickname, false);
            spark.send('bothmatched');
            primus.room(roomname).send('updateusers', usersData);
          }
          else {
            spark.send('nomatch');
          }
        }
      }
      else { // The user has guessed both track and artist
        spark.send('stoptrying');
      }
    }
  };

  this.ignore = function(who, executor, callback) {
    // Check if the player to be ignored is in the room
    if (usersData[who]) {
      // Inform the bad player that he/she is being ignored
      var recipient = sparks[who];
      recipient.send('chatmsg', executor+' is ignoring you.', 'binb', who);
      return callback(true, who);
    }
    callback(false);
  };

  this.joinRoom = function(spark) {
    spark.join(roomname);
    addUser(spark, true);
  };

  // Kick a user
  this.kick = function(who, why, executor, callback) {
    usersdb.hget('user:'+executor, 'role', function (err, role) {
      if (role > 0) { // Check role
        if (usersData[who]) {
          if (why) {
            why = ' ('+why+')';
          }
          var notice = 'you have been kicked by '+executor+why+'.';
          var recipient = sparks[who];
          recipient.send('chatmsg', notice, 'binb', who);
          recipient.end();
        }
        return callback(true);
      }
      callback(false);
    });
  };

  // A user has left (DCed, etc.)
  this.removeUser = function(nickname) {
    // Delete the references
    delete sparks[nickname];
    delete usersData[nickname];
    totusers--;
    // Broadcast the event
    primus.send('updateoverview', roomname, totusers);
    primus.room(roomname).send('userleft', nickname, usersData);
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
  this.sendChatMessage = function(msg, spark, to) {
    if (isString(to)) {
      // Check if the recipient is in the room
      if (usersData[to]) {
        spark.send('chatmsg', msg, spark.nickname, to);
        var recipient = sparks[to];
        recipient.send('chatmsg', msg, spark.nickname, to);
      }
      return;
    }
    // Censor answers from chat
    var msglcase = msg.toLowerCase();
    if (status === 0 && (amatch(artist, msglcase, true) ||
        (feat && amatch(feat, msglcase, true)) || amatch(title, msglcase))) {
      var notice = 'You are probably right, but you have to use the box above.';
      spark.send('chatmsg', notice, 'binb', spark.nickname);
      return;
    }
    primus.room(roomname).send('chatmsg', msg, spark.nickname);
  };

  // Extract a random track from the database and send the load event
  var sendLoadTrack = function() {
    var index = randInt(trackscount);
    songsdb.zrange(roomname, index, index, function(err, res) {
      var id = res[0];
      // Check if extracted track is in the list of already played tracks
      if (~playedtracks.indexOf(id)) {
        return sendLoadTrack();
      }
      playedtracks.push(id);
      var args = [
        'song:'+id
        , 'artistName'
        , 'trackName'
        , 'previewUrl'
        , 'artworkUrl60'
        , 'trackViewUrl'
      ];
      songsdb.hmget(args, function(e, replies) {
        artistName = replies[0];
        artist = artistName.toLowerCase();
        trackName = replies[1];
        title = trackName.toLowerCase();
        feat = /feat\. (.+?)[)\]]/.test(title) ? RegExp.$1 : null;
        previewUrl = replies[2];
        artworkUrl = replies[3];
        trackViewUrl = replies[4];
        primus.room(roomname).send('loadtrack', previewUrl);
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
      tot: config.songsinarun,
      users: usersData
    };
    primus.room(roomname).send('playtrack', data);
    songTimeLeft(Date.now() + 30000, 50);
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
    };
    primus.room(roomname).send('trackinfo', trackinfo);
    finishline = 1;

    if (songcounter < config.songsinarun) {
      resetPoints(true);
      sendLoadTrack();
      return;
    }

    status = 2; // Sending last track info
    setTimeout(gameOver, 5000);
  };

  // A user is submitting a name
  this.setNickName = function(spark, nickname) {
    var feedback = null;

    if (nickname === 'binb') {
      feedback = '<span class="label label-important">That name is reserved.</span>';
    }
    else if (!isUsername(nickname)) {
      feedback = '<span class="label label-important">Name must contain only ';
      feedback += 'alphanumeric characters.</span>';
    }
    else if (sparks[nickname]) {
      feedback = '<span class="label label-important">Name already taken.</span>';
    }

    if (feedback) {
      return spark.send('invalidnickname', feedback);
    }

    // Check if requested nickname belong to a registered user
    var key = 'user:'+nickname;
    usersdb.exists(key, function(err, resp) {
      if (resp === 1) {
        feedback = '<span class="label label-important">That name belongs ';
        feedback += 'to a registered user.</span>';
        return spark.send('invalidnickname', feedback);
      }
      spark.nickname = nickname;
      spark.join(roomname);
      addUser(spark, false);
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
    songsdb.zcard(roomname, function(err, card) {
      trackscount = card;
      sendLoadTrack();
    });
  };

  // Return the number of tracks in the room
  this.tracksCount = function() {
    return trackscount;
  };

  this.unignore = function(who, executor) {
    if (usersData[who]) {
      // Inform the bad player that he/she is no longer ignored
      var notice = executor+' has stopped ignoring you.';
      var recipient = sparks[who];
      recipient.send('chatmsg', notice, 'binb', who);
    }
  };
}
