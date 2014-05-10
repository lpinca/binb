/**
 * Module dependencies.
 */

var amatch = require('./match')
  , clients = require('./redis-clients')
  , config = require('../config')
  , fifolength = config.songsinarun * config.gameswithnorepeats
  , primus
  , randInt = require('./prng').randInt
  , rooms = {} // The Object that contains all the room instances
  , songsdb = clients.songs
  , sparks
  , updateStats = require('./stats')
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
    rooms[room] = new Room(room);
  });
};

module.exports.rooms = rooms;

/**
 * Room constructor.
 */

function Room(roomname) {
  this.artist = null;       // Artists in lowercase
  this.artistName = null;   // Artists of the track
  this.artworkUrl = null;   // The URL of the album cover
  this.feat = null;         // Featured artists
  this.finishline = 1;      // A counter to handle the 3 fastest answers
  this.playedtracks = [];   // The list of already played songs
  this.previewUrl = null;   // The URL for the preview of the track
  this.roomname = roomname;
  this.songcounter = 0;     // A counter for the track of the current game
  this.songtimeleft = 0;    // Remaining time for the current playing track
  this.status = 3;          // The room status
  this.title = null;        // Title in lowercase
  this.trackName = null;    // Title of the track
  this.trackViewUrl = null; // The iTunes URL of the track
  this.trackscount = 0;     // The number of available tracks in the room
  this.totusers = 0;        // The number of players in the room
  this.usersData = Object.create(null);

  this.initialize();
}

/**
 * Room states.
 */

Room.PLAYING = 0;   // A track is playing
Room.LOADING = 1;   // A track is loading
Room.ENDING = 2;    // The game is over
Room.STARTING = 3;  // A new game is about to start

/**
 * Add points and collect players' statistics.
 */

Room.prototype.addPointsAndStats = function(nickname, allinone) {
  var stats = {}
    , userData = this.usersData[nickname];

  switch (this.finishline) {
    case 1:
      this.finishline++;
      if (allinone) {
        stats.points = 6;
        userData.points += 6;
      } else {
        stats.points = 5;
        userData.points += 5;
      }
      stats.gold = true;
      userData.golds++;
      userData.roundpoints = 6;
      break;
    case 2:
      this.finishline++;
      if (allinone) {
        stats.points = 5;
        userData.points += 5;
      } else {
        stats.points = 4;
        userData.points += 4;
      }
      stats.silver = true;
      userData.silvers++;
      userData.roundpoints = 5;
      break;
    case 3:
      this.finishline++;
      if (allinone) {
        stats.points = 4;
        userData.points += 4;
      } else {
        stats.points = 3;
        userData.points += 3;
      }
      stats.bronze = true;
      userData.bronzes++;
      userData.roundpoints = 4;
      break;
    default:
      if (allinone) {
        stats.points = 3;
        userData.points += 3;
      } else {
        stats.points = 2;
        userData.points += 2;
      }
      userData.roundpoints = 3;
  }

  userData.guessed++;
  userData.guesstime = 30000 - this.songtimeleft;
  userData.matched = 'both';
  userData.totguesstime += userData.guesstime;

  if (userData.registered) {
    stats.guesstime = userData.guesstime;
    stats.userscore = userData.points;
    updateStats(nickname, stats);
  }
};

/**
 * Add a new player in the room.
 */

Room.prototype.addUser = function(spark, loggedin) {
  var nickname = spark.nickname
    , usersData = this.usersData;

  sparks[nickname] = spark;

  usersData[nickname] = {
    bronzes: 0,
    golds: 0,
    guessed: 0,
    guesstime: null,
    matched: null,
    nickname: nickname,
    points: 0,
    registered: loggedin,
    roundpoints: 0,
    silvers: 0,
    totguesstime: 0
  };

  this.totusers++;

  // Broadcast new user event
  primus.send('updateoverview', this.roomname, this.totusers);
  spark.send('ready', usersData, this.trackscount, loggedin);
  primus.room(this.roomname).except(spark.id).send('newuser', nickname, usersData);
};

/**
 * Build the podium and start a new game.
 */

Room.prototype.gameOver = function() {
  var podium = []
    , usersData = this.usersData;

  // Build podium
  for (var key in usersData) {
    podium.push(usersData[key]);
  }
  podium.sort(function(a, b) {
    return b.points - a.points;
  });
  podium.splice(3);

  primus.room(this.roomname).send('gameover', podium);

  // Collect podium stats
  podium.forEach(function(user, index) {
    if (user.registered) {
      updateStats(user.nickname, { podiumplace: index + 1 });
    }
  });

  this.resetPoints(false);
  this.songcounter = 0;

  // Check if FIFO is full
  if (this.playedtracks.length === fifolength) {
    this.playedtracks.splice(0, config.songsinarun);
  }

  // Start a new game
  this.status = Room.STARTING;
  setTimeout(this.sendLoadTrack.bind(this), 5000);
};

/**
 * Initialize the room.
 */

Room.prototype.initialize = function() {
  var room = this;

  songsdb.zcard([this.roomname], function(err, card) {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }

    room.trackscount = card;
    room.sendLoadTrack();
  });
};

/**
 * Send a chat message.
 */

Room.prototype.onChatMessage = function(msg, spark, to) {
  var from = spark.nickname;

  if (isString(to)) {
    // Check if the recipient is in the room
    if (this.usersData[to]) {
      spark.send('chatmsg', msg, from, to);
      sparks[to].send('chatmsg', msg, from, to);
    }
    return;
  }

  // Censor answers from chat
  var feat = this.feat
    , msglcase = msg.toLowerCase();

  if (this.status === Room.PLAYING && (amatch(this.artist, msglcase, true) ||
      (feat && amatch(feat, msglcase, true)) || amatch(this.title, msglcase))) {
    var notice = 'You are probably right, but you have to use the box above.';
    spark.send('chatmsg', notice, 'binb', from);
    return;
  }

  primus.room(this.roomname).send('chatmsg', msg, from);
};

/**
 * Handle players' guesses.
 */

Room.prototype.onGuess = function(spark, guess) {
  if (this.status !== Room.PLAYING) {
    return;
  }

  var artist = this.artist
    , feat = this.feat
    , title = this.title
    , userData = this.usersData[spark.nickname];

  // The user hasn't guessed anything
  if (!userData.matched) {
    if ((artist === title) && amatch(title, guess, true)) {
      return this.onPair(spark, true);
    }
    if (amatch(artist, guess, true) || (feat && amatch(feat, guess, true))) {
      return this.onMatch(spark, 'artist');
    }
    if (amatch(title, guess)) {
       return this.onMatch(spark, 'title');
    }
    return spark.send('nomatch');
  }

  // The user has guessed the track or the artist
  if (userData.matched !== 'both') {
    if (userData.matched === 'artist') {
      if (amatch(title, guess)) {
        return this.onPair(spark);
      }
      return spark.send('nomatch');
    }
    if (amatch(artist, guess, true) || (feat && amatch(feat, guess, true))) {
      return this.onPair(spark);
    }
    return spark.send('nomatch');
  }

  // The user has guessed both track and artist
  return spark.send('stoptrying');
};

/**
 * Inform a player that he/she is being ignored.
 */

Room.prototype.onIgnore = function(who, executor, callback) {
  // Check if the player to be ignored is in the room
  if (this.usersData[who]) {
    sparks[who].send('chatmsg', executor + ' is ignoring you.', 'binb', who);
    return callback(true, who);
  }
  callback(false);
};

/**
 * Kick a player.
 */

Room.prototype.onKick = function(who, why, executor, callback) {
  var room = this;

  usersdb.hget(['user:' + executor, 'role'], function(err, role) {
    if (err) {
      console.error(err.message);
      return callback(true);
    }

    // Check role
    if (role > 0) {
      if (room.usersData[who]) {
        if (why) {
          why = ' (' + why + ')';
        }
        var notice = 'you have been kicked by ' + executor + why + '.'
          , recipient = sparks[who];
        recipient.send('chatmsg', notice, 'binb', who);
        recipient.end();
      }
      return callback(true);
    }
    callback(false);
  });
};

/**
 * Handle cases where the player has guessed title or artist.
 */

Room.prototype.onMatch = function(spark, what) {
  var nickname = spark.nickname
    , usersData = this.usersData
    , userData = usersData[nickname];

  userData.matched = what;
  userData.points++;
  userData.roundpoints++;
  spark.send(what + 'matched');
  primus.room(this.roomname).send('updateusers', usersData);

  if (userData.registered) {
    updateStats(nickname, {
      points: 1,
      userscore: userData.points
    });
  }
};

/**
 * Handle cases where the player has guessed both title and artist.
 */

Room.prototype.onPair = function(spark, allinone) {
  this.addPointsAndStats(spark.nickname, allinone);
  spark.send('bothmatched');
  primus.room(this.roomname).send('updateusers', this.usersData);
};

/**
 * Add an unauthenticated player in the room after checking that his/her
 * nickname is valid.
 */

Room.prototype.onUnauthenticatedJoin = function(spark, nickname) {
  var feedback
    , room = this;

  if (nickname === 'binb') {
    feedback = 'That name is reserved.';
  }
  else if (!isUsername(nickname)) {
    feedback = 'Name must contain only alphanumeric characters.';
  }
  else if (sparks[nickname]) {
    feedback = 'Name already taken.';
  }

  if (feedback) {
    return spark.send('invalidnickname', feedback);
  }

  // Check if requested nickname belongs to a registered user
  usersdb.exists(['user:' + nickname], function(err, exists) {
    if (err) {
      console.error(err.message);
      feedback = 'Could not check name availability.';
      return spark.send('invalidnickname', feedback);
    }

    if (exists) {
      feedback = 'That name belongs to a registered user.';
      return spark.send('invalidnickname', feedback);
    }

    spark.nickname = nickname;
    spark.join(room.roomname);
    room.addUser(spark, false);
  });
};

/**
 * Inform a player that he/she is no longer ignored.
 */

Room.prototype.onUnignore = function(who, executor) {
  if (this.usersData[who]) {
    var notice = executor + ' has stopped ignoring you.';
    sparks[who].send('chatmsg', notice, 'binb', who);
  }
};

/**
 * Remove a player from the room.
 */

Room.prototype.removeUser = function(nickname) {
  var usersData = this.usersData;

  // Delete the references
  delete sparks[nickname];
  delete usersData[nickname];

  this.totusers--;

  // Broadcast the event
  primus.send('updateoverview', this.roomname, this.totusers);
  primus.room(this.roomname).send('userleft', nickname, usersData);
};

/**
 * Clean up users' data.
 */

Room.prototype.resetPoints = function(roundonly) {
  var usersData = this.usersData
    , userData;

  for (var key in usersData) {
    userData = usersData[key];
    if (!roundonly) {
      userData.points = 0;
      userData.guessed = 0;
      userData.totguesstime = 0;
      userData.golds = 0;
      userData.silvers = 0;
      userData.bronzes = 0;
    }
    userData.roundpoints = 0;
    userData.matched = null;
    userData.guesstime = null;
  }
};

/**
 * Extract a random track and send the load event to all connected clients.
 */

Room.prototype.sendLoadTrack = function() {
  this.status = Room.LOADING;

  var index = randInt(this.trackscount)
    , room = this;

  songsdb.zrange([this.roomname, index, index], function(err, res) {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }

    var id = res[0];
    // Check if extracted track is in the list of already played tracks
    if (~room.playedtracks.indexOf(id)) {
      return room.sendLoadTrack();
    }

    room.playedtracks.push(id);

    songsdb.hmget([
      'song:' + id
      , 'artistName'
      , 'trackName'
      , 'previewUrl'
      , 'artworkUrl60'
      , 'trackViewUrl'
    ], function(err, replies) {
      if (err) {
        console.error(err.message);
        process.exit(1);
      }

      room.artistName = replies[0];
      room.artist = room.artistName.toLowerCase();
      room.trackName = replies[1];
      room.title = room.trackName.toLowerCase();
      room.feat = /feat\. (.+?)[)\]]/.test(room.title) ? RegExp.$1 : null;
      room.previewUrl = replies[2];
      room.artworkUrl = replies[3];
      room.trackViewUrl = replies[4];
      primus.room(room.roomname).send('loadtrack', room.previewUrl);

      setTimeout(room.sendPlayTrack.bind(room), 5000);
    });
  });
};

/**
 * Send the play event to all connected clients.
 */

Room.prototype.sendPlayTrack = function() {
  this.status = Room.PLAYING;
  this.songcounter++;

  primus.room(this.roomname).send('playtrack', {
    counter: this.songcounter,
    tot: config.songsinarun,
    users: this.usersData
  });

  this.startTimer(Date.now() + 30000, 50);
  setTimeout(this.sendTrackInfo.bind(this), 30000);
};

/**
 * Send the room status to the client that asked for it.
 */

Room.prototype.sendStatus = function(callback) {
  callback({
    status: this.status,
    timeleft: this.songtimeleft,
    previewUrl: this.previewUrl
  });
};

/**
 * Send the track info to all connected clients.
 */

Room.prototype.sendTrackInfo = function() {
  primus.room(this.roomname).send('trackinfo', {
    artworkUrl: this.artworkUrl,
    artistName: this.artistName,
    trackName: this.trackName,
    trackViewUrl: this.trackViewUrl,
  });

  this.finishline = 1;

  if (this.songcounter < config.songsinarun) {
    this.resetPoints(true);
    return this.sendLoadTrack();
  }

  this.status = Room.ENDING;
  setTimeout(this.gameOver.bind(this), 5000);
};

/**
 * Start a timer to periodically update the remaining time of the playing song.
 */

Room.prototype.startTimer = function(end, delay) {
  var interval
    , room = this;

  room.songtimeleft = end - Date.now();

  interval = setInterval(function() {
    room.songtimeleft = end - Date.now();
    if (room.songtimeleft < delay) {
      clearInterval(interval);
    }
  }, delay);
};
