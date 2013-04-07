(function() {

  var elapsedtime = 0
    , DOM = {}
    , historycursor = 0
    , historyvalues = []
    , ignoredplayers = {}
    , jplayer
    , nickname
    , pvtmsgto
    , subscriber = false
    , roundpoints = 0
    , roomname = window.location.pathname.replace('/', '')
    , socket
    , stopanimation = false
    , touchplay
    , urlregex = /(https?:\/\/[\-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[\-A-Za-z0-9+&@#\/%=~_()|])/
    , uri = window.location.protocol+'//'+window.location.host; // Socket.IO server URI

  var amstrings = [
    'Yes, that\'s the artist. What about the title?'
    , 'Exactly, now tell me the title!'
    , 'Do you also know the title?'
  ];

  var bmstrings = [
    'Yeah true! do you like this track?'
    , 'Good job!'
    , 'Great!'
    , 'Very well done!'
    , 'Exactly!'
    , 'Excellent!'
    , 'Woohoo!'
  ];

  var nmstrings = [
    'Nope, sorry!'
    , 'No way!'
    , 'Fail'
    , 'Nope'
    , 'No'
    , 'That\'s wrong'
    , 'What?!'
    , 'Wrong', 'Haha, what?!'
    , 'You kidding?'
    , 'Don\'t make me laugh'
    , 'You mad?'
    , 'Try again'
  ];

  var states = [
    'A song is already playing, please wait for the next one...'
    , 'Game is about to start...'
    , 'Game is over'
    , 'New game will start soon...'
  ];

  var tmstrings = [
    'Yes, you guessed the title. Who is the artist?'
    , 'Now tell me the artist!'
    , 'Correct, do you also know the artist?'
  ];

  String.prototype.encodeEntities = function() {
    return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  // Add a chat entry, whether message, notification, etc.
  var addChatEntry = function(childNode) {
    var li = $('<li class="entry"></li>');
    li.append(childNode);
    DOM.chat.append(li);
    DOM.chat[0].scrollTop = DOM.chat[0].scrollHeight;
  };

  var addFeedback = function(txt, style) {
    if (typeof style === 'string') {
      var fbspan = $('<span class="'+style+'"></span>');
      fbspan.text(txt);
      DOM.feedback.html(fbspan);
      DOM.guessbox.addClass(style);
      setTimeout(function() {DOM.guessbox.removeClass(style);}, 350);
      return;
    }
    DOM.feedback.text(txt);
  };

  var addPrivate = function(usrname) {
    if (pvtmsgto) {
      clearPrivate();
    }
    if (nickname === usrname) {
      return;
    }
    DOM.recipient.css('margin-right', '4px');
    DOM.recipient.text('To '+usrname+':');
    var width = DOM.recipient.outerWidth(true) + 1;
    DOM.recipient.hide();
    DOM.messagebox.animate({'width':'-='+width+'px'}, 'fast', function() {
      DOM.recipient.show();
    });
    var el = $('.name').filter(function(index) {
      return $(this).text() === usrname;
    });
    el.prevAll('.private').show();
    el.unbind('click');
    el.click(clearPrivate);
    pvtmsgto = usrname;
    DOM.messagebox.focus();
  };

  // Add track info
  var addTrackInfo = function(data) {
    if (touchplay) {
      touchplay.removeClass('btn-success').addClass('btn-danger disabled');
      touchplay.html('<i class="icon-play icon-white"></i> Wait');
    }
    cassetteAnimation(Date.now()+5000, false);

    var artistName = data.artistName.replace(/"/g, '&quot;')
      , trackName = data.trackName.replace(/"/g, '&quot;')
      , attrs = ''
      , rp = '';

    var html = '<li class="bordered"><img class="artwork" src="'+data.artworkUrl+'"/>';
    html += '<div class="info"><div class="artist" title="'+artistName+'">'+artistName+'</div>';
    html += '<div class="title" title="'+trackName+'">'+trackName+'</div></div>';

    if (roundpoints > 0) {
      rp = '+'+roundpoints;
      if (roundpoints > 3) {
        var stand = 7 - roundpoints;
        attrs += 'class="icons round-rank stand'+stand+'"';
      }
    }
    html += '<div '+attrs+'></div><div class="round-points">'+rp+'</div>';
    html += '<a class="icons" target="itunes_store" href="'+data.trackViewUrl+'"></a></li>';

    DOM.tracks.prepend($(html));
  };

  var addVolumeControl = function() {
    var volumebutton = $('<div id="volume-button">'+
      '<a class="button"><div id="icon" class="icons volume-high"></div></a>'+
      '<div id="volume-slider">'+ // Outer background
        '<div id="volume-total"></div>'+ // Rail
        '<div id="volume-current"></div>'+ // Current volume
        '<div id="volume-handle"></div>'+ // Handle
      '</div></div>').appendTo('#volume');

    var clicked = false
      , icon = volumebutton.find('#icon')
      , mouseisdown = false
      , mouseisover = false
      , oldvalue = 1
      , volumecurrent = volumebutton.find('#volume-current')
      , volumehandle = volumebutton.find('#volume-handle')
      , volumeslider = volumebutton.find('#volume-slider')
      , volumetotal = volumebutton.find('#volume-total');

    var handleIcon = function (volume) {
      if (volume === 0) {
        icon.removeClass().addClass('icons volume-none');
      }
      else if (volume <= 0.33) {
        icon.removeClass().addClass('icons volume-low');
      }
      else if (volume <= 0.66) {
        icon.removeClass().addClass('icons volume-medium');
      }
      else {
        icon.removeClass().addClass('icons volume-high');
      }
    };

    var handleVolumeMove = function(e) {
      var railheight = volumetotal.height()
        , totaloffset = volumetotal.offset()
        , totalTop = parseInt(volumetotal.css('top').replace(/px/, ''), 10)
        , newy = e.pageY - totaloffset.top
        , volume = (railheight - newy) / railheight;

      clicked = false;

      if (newy < 0) {
        newy = 0;
      }
      else if (newy > railheight) {
        newy = railheight;
      }

      volumecurrent.height(railheight - newy);
      volumecurrent.css('top', newy + totalTop);
      volumehandle.css('top', totalTop + newy - (volumehandle.height() / 2));

      volume = Math.max(0, volume);
      volume = Math.min(volume, 1);

      setVolume(volume);
    };

    var loadFromCookie = function() {
      if (/volume\s*\=/.test(document.cookie)) {
        var value = document.cookie.replace(/.*volume\s*\=\s*([^;]*);?.*/, '$1');
        value = parseFloat(value);
        positionVolumeHandle(value);
        setVolume(value);
        return;
      }
      positionVolumeHandle(1);
    };

    var positionVolumeHandle = function(volume) {
      if (!volumeslider.is(':visible')) {
        volumeslider.show();
        positionVolumeHandle(volume);
        volumeslider.hide();
        return;
      }
      var totalheight = volumetotal.height();
      var totalposition = volumetotal.position();
      var newtop = totalheight - (totalheight * volume);
      volumecurrent.height(totalheight - newtop );
      volumecurrent.css('top', totalposition.top + newtop);
      volumehandle.css('top', totalposition.top + newtop - (volumehandle.height() / 2));
    };

    var setCookie = function(volume) {
      var d = new Date();
      d.setTime(d.getTime() + 31536000000); // One year in milliseconds
      document.cookie = 'volume='+volume+';path=/;expires='+d.toGMTString()+';';
    };

    var setVolume = function(volume) {
      handleIcon(volume);
      jplayer.jPlayer('volume', volume);
      oldvalue = volume;
      setCookie(volume);
    };

    volumebutton.find('.button').click(function() {
      if (!clicked) {
        clicked = true;
        if (oldvalue !== 0) {
          handleIcon(0);
          jplayer.jPlayer('volume', 0);
          positionVolumeHandle(0);
        }
      }
      else {
        clicked = false;
        if (oldvalue !== 0) {
          handleIcon(oldvalue);
          jplayer.jPlayer('volume', oldvalue);
          positionVolumeHandle(oldvalue);
        }
      }
    });

    volumebutton.hover(function() {
      mouseisover = true;
      volumeslider.show();
    }, function() {
      mouseisover = false;
      if (!mouseisdown) {
        volumeslider.hide();
      }
    });

    volumeslider.on('mouseover', function() {
      mouseisover = true;
    }).on('mousedown', function(e) {
      handleVolumeMove(e);
      mouseisdown = true;
      return false;
    });

    $(document).on('mouseup', function(e) {
      mouseisdown = false;
      if (!mouseisover) {
        volumeslider.hide();
      }
    }).on('mousemove', function(e) {
      if (mouseisdown) {
        handleVolumeMove(e);
      }
    });

    loadFromCookie();
  };

  // Called when a registered user already in a room, tries to enter in another room
  var alreadyInARoom = function() {
    var html = '<div class="modal-header"><h3>Already in a room</h3></div>';
    html += '<div class="modal-body"><div class="alert alert-error alert-block">';
    html += '<h4 class="alert-heading">Warning!</h4>You are already in a room.<br/>';
    html += 'Leave the other room and refresh this page or close this one.</div></div>';
    $(html).appendTo(DOM.modal);
    DOM.modal.modal('show');
  };

  // Start cassette animation
  var cassetteAnimation = function(endtime, forward) {
    var deg
      , factor
      , millisleft = endtime - Date.now()
      , offsetleft
      , offsetright
      , secleft = millisleft / 1000
      , width;

    if (stopanimation || millisleft < 50) {
      return;
    }

    if (forward) {
      if (touchplay) {
        elapsedtime = 30 - Math.round(secleft);
      }
      DOM.countdown.text(secleft.toFixed(1));
      factor = secleft / 30;
      width = 148 - 148 * factor;
      deg = 360 - 360 * factor;
      offsetleft = 44 - 24 * factor;
      offsetright = 130 - 24 * factor;
    }
    else {
      DOM.countdown.text(Math.round(secleft));
      factor = secleft / 5;
      width = 148 * factor;
      deg = 360 * factor;
      offsetleft = 20 + 24 * factor;
      offsetright = 106 + 24 * factor;
    }

    DOM.progress.width(width);
    DOM.cassettewheels.css('transform', 'rotate('+deg+'deg)');
    DOM.tapeleft.css('left', offsetleft+'px');
    DOM.taperight.css('left', offsetright+'px');

    setTimeout(function() {
      cassetteAnimation(endtime, forward);
    }, 50);
  };

  var clearPrivate = function() {
    var width = DOM.recipient.outerWidth(true) + 1;
    DOM.recipient.css('margin-right', '0');
    DOM.recipient.text('');
    DOM.messagebox.animate({'width':'+='+width+'px'}, 'fast');
    var el = $('.name').filter(function(index) {
      return $(this).text() === pvtmsgto;
    });
    el.prevAll('.private').hide();
    el.unbind('click');
    el.click(function() {
      addPrivate($(this).text());
    });
    pvtmsgto = null;
    DOM.messagebox.focus();
  };

  // Game over countdown
  var countDown = function(endtime) {
    var millisleft = endtime - Date.now();
    var secleft = millisleft / 1000;
    $('.modal-footer span').text(Math.round(secleft));
    if (millisleft < 200) {
      return;
    }
    setTimeout(function() {countDown(endtime);}, 200);
  };

  // Let the user know when he/she has disconnected
  var disconnect = function() {
    stopanimation = true;
    jplayer.jPlayer('stop');
    var errorspan = $('<span class="error">ERROR: You have disconnected.</span>');
    addChatEntry(errorspan);
    addFeedback('Something wrong happened');
    DOM.users.empty();
  };

  var gameOver = function(podium) {
    var html = '<div class="modal-header"><h3>Game Over</h3></div>';
    html += '<div class="modal-body"><table class="table table-striped scoreboard">';
    html += '<thead><tr><th>#</th><th>Name</th><th>Points</th>';
    html += '<th><div class="icons cups stand1"></div></th>';
    html += '<th><div class="icons cups stand2"></div></th>';
    html += '<th><div class="icons cups stand3"></div></th><th>Guessed</th><th>Mean time</th>';
    html += '</thead><tbody>';

    for(var i=0;i<3;i++) {
      if (podium[i]) {
        html += '<tr><td><div class="icons medals rank'+(i+1)+'"></div></td>';
        html += '<td class="name">'+podium[i].nickname+'</td>';
        html += '<td>'+podium[i].points+'</td>';
        html += '<td>'+podium[i].golds+'</td><td>'+podium[i].silvers+'</td>';
        html += '<td>'+podium[i].bronzes+'</td><td>'+podium[i].guessed+'</td>';
        var meantime = "N/A";
        if (podium[i].guessed !== 0) {
          meantime = podium[i].totguesstime / podium[i].guessed;
          meantime = (meantime / 1000).toFixed(1)+' s';
        }
        html += '<td>'+meantime+'</td></tr>';
      }
    }

    html +='</tbody></table></div>';
    html += '<div class="modal-footer align-left">A new game will start in ';
    html += '<span></span> second/s</div>';
    DOM.modal.append($(html));
    DOM.modal.modal('show');
    countDown(Date.now()+10000);
  };

  // Receive a chat message
  var getChatMessage = function(chatmsg, from, to) {
    if (ignoredplayers[from]) {
      return;
    }
    var prefix = from;
    var msgspan = $('<span class="message"></span>');
    if (to) {
      // Private Message
      prefix = (nickname === from) ? '(To '+to+')' : '(From '+prefix+')';
      msgspan.addClass('private');
    }
    var msg = prefix+': '+chatmsg.replace(/<3/g, '♥');
    msgspan.html(urlize(msg));
    addChatEntry(msgspan);
  };

  var hideChat = function() {
    DOM.togglechat.text('Show chat').unbind('click');
    DOM.chatwrapper.toggle(300);
    DOM.tracks.animate({maxHeight:'434px'}, 300);
    DOM.togglechat.click(showChat);
  };

  // Put a player in the ignore list
  var ignorePlayer = function(args, outcome) {
    if (ignoredplayers[args[0]]) {
      outcome.text('(From binb): '+args[0]+' is already ignored.');
      return addChatEntry(outcome);
    }
    socket.emit('ignore', args[0], function(player) {
      if (player) {
        ignoredplayers[player] = true;
        outcome.text('(From binb): '+player+' is now ignored.');
        return addChatEntry(outcome);
      }
      outcome.append('player not found.');
      addChatEntry(outcome);
    });
  };

  // Submitted name was invalid
  var invalidNickName = function(feedback) {
    joinAnonymously(feedback+'<br/>Try with another one:');
  };

  // Prompt for name and send it
  var joinAnonymously = function(msg) {
    if (/nickname\s*\=/.test(document.cookie) && !msg) {
      nickname = document.cookie.replace(/.*nickname\s*\=\s*([^;]*);?.*/, '$1');
      return socket.emit('joinanonymously', nickname, roomname);
    }

    if (DOM.modal.hasClass('in')) {
      $('.modal-body p').html(msg);
      return $('#login').focus();
    }

    var html = '<div class="modal-header">';
    html += '<h3>You are joining the '+roomname+' room</h3></div>';
    html += '<div class="modal-body"><p>'+(msg || "What's your name?")+'</p></div>';
    html += '<div class="modal-footer relative">';
    html += '<input id="login" maxlength="15" type="text" name="nickname" />';
    html += '<button id="join" class="btn btn-success">';
    html += '<i class="icon-user icon-white"></i> Join the game</button>';
    html += '<span class="divider"><span>or</span></span>';
    html += '<a class="btn btn-primary" href="/login?followup=/'+roomname+'">';
    html += '<i class="icon-lock icon-white"></i> Login</a></div>';

    $(html).appendTo(DOM.modal);
    var login = $('#login');
    var button = $('#join');

    button.click(function() {
      if ($.trim(login.val()) !== '') {
        nickname = login.val();
        socket.emit('joinanonymously', nickname, roomname);
      }
      else {
        var txt = 'Nickname can\'t be empty.';
        invalidNickName('<span class="label label-important">'+txt+'</span>');
      }
      login.val('');
    });

    login.keyup(function(event) {
      if (event.keyCode === 13) {
        button.click();
      }
    });

    DOM.modal.modal('show');
    DOM.modal.on('shown', function() {
      login.focus();
    });
  };

  var jplayerReady = function() {
    socket.emit('loggedin', function(data) {
      if (data) {
        nickname = data;
        subscriber = true;
        return socket.emit('joinroom', roomname);
      }
      joinAnonymously();
    });
    if (!$.jPlayer.platform.mobile && !$.jPlayer.platform.tablet) {
      return addVolumeControl();
    }
    var touchbackdrop = $('<div id="touch-backdrop">'+
      '<button id="touch-play" class="btn btn-danger disabled">'+
        '<i class="icon-play icon-white"></i> Wait'+
      '</button></div>').appendTo('#cassette');
    touchplay = $('#touch-play');
    touchplay.click(function() {
      if (!$(this).hasClass('btn-danger')) {
        touchplay = null;
        jplayer.jPlayer('play', elapsedtime);
        touchbackdrop.remove();
      }
    });
  };

  // Kick a player
  var kickPlayer = function(args, outcome) {
    outcome.append('you are not allowed to kick a player.');
    if (!subscriber) {
      return addChatEntry(outcome);
    }
    var why = args[1] || '';
    socket.emit('kick', args[0], why, function() {
      addChatEntry(outcome);
    });
  };

  var loadTrack = function(previewUrl) {
    jplayer.jPlayer('mute');
    jplayer.jPlayer('setMedia', {m4a: previewUrl});
  };

  /**
   * Given a string, parse the string extracting fields separated by whitespace
   * and optionally enclosed within double quotes (which are stripped off), and
   * build an array of copies of the string for each field.
   */

  var parseCommand = function(input) {
    var inquotes = false
      , token = ''
      , tokens = [];
    for (var i = 0; i < input.length; i++) {
      if (input[i] === '\\') {
        if (++i === input.length) {
          throw new Error('SyntaxError: Unexpected end of input');
        }
        if (input[i] === '\\' || input[i] === '"' || !inquotes) {
          token += input[i];
          continue;
        }
        token += '\\'+input[i];
        continue;
      }
      if (input[i] === '"') {
        inquotes = !inquotes;
        var j = i + 1;
        if (!inquotes && (input[j] === ' ' || j === input.length)) {
          tokens.push(token);
          token = '';
          i = j;
        }
        continue;
      }
      if (input[i] === ' ') {
        if (inquotes) {
          token += ' ';
        }
        else if (token.length) {
          tokens.push(token);
          token = '';
        }
        continue;
      }
      token += input[i];
    }
    if (inquotes) {
      throw new Error('SyntaxError: Unexpected end of input');
    }
    if (token.length) {
      tokens.push(token);
    }
    return tokens;
  };

  // Play a track
  var playTrack = function(data) {
    if (touchplay) {
      touchplay.removeClass('btn-danger disabled').addClass('btn-success');
      touchplay.html('<i class="icon-play icon-white"></i> Play');
    }
    jplayer.jPlayer('unmute');
    jplayer.jPlayer('play');
    updateUsers(data.users);
    cassetteAnimation(Date.now()+30000, true);
    if (data.counter === 1) {
      DOM.modal.modal('hide').empty();
      DOM.tracks.empty();
    }
    DOM.track.text(data.counter+'/'+data.tot);
    addFeedback('What is this song?');
  };

  // Successfully joined the room
  var ready = function(usersData, trackscount, loggedin) {
    if (!loggedin && !/nickname\s*\=/.test(document.cookie)) {
      document.cookie = 'nickname='+nickname+';path=/;';
    }

    DOM.modal.modal('hide').empty();
    $('#total-tracks span').text(trackscount);
    var msg = nickname+' joined the game';
    var joinspan = $('<span class="join"></span>');
    joinspan.text(msg);
    addChatEntry(joinspan);
    updateUsers(usersData);

    DOM.messagebox.keydown(function(event) {
      if (event.keyCode === 13) {
        var val = $.trim(DOM.messagebox.val());
        if (val !== '') {
          if (pvtmsgto) {
            socket.emit('sendchatmsg', val, pvtmsgto);
          }
          else if (/^\/[^ ]/.test(val)) {
            slashCommandHandler(val);
          }
          else {
            socket.emit('sendchatmsg', val);
          }
        }
        DOM.messagebox.val('');
      }
    });

    DOM.guessbox.keydown(function(event) {
      switch (event.keyCode) {
        case 13: // return
          var guess = $.trim(DOM.guessbox.val());
          if (guess !== '') {
            socket.emit('guess', guess.toLowerCase());
            historyvalues.push(guess);
            if (historyvalues.length > 20) {
              historyvalues.splice(0, 1);
            }
            historycursor = historyvalues.length;
          }
          DOM.guessbox.val('');
          break;
        case 38: // up-arrow
          if (historycursor > 0) {
            DOM.guessbox.val(historyvalues[--historycursor]);
          }
          break;
        case 40: // down-arrow
          if (historycursor < historyvalues.length - 1) {
            DOM.guessbox.val(historyvalues[++historycursor]);
          }
          else {
            historycursor = historyvalues.length;
            DOM.guessbox.val('');
          }
      }
    });

    DOM.guessbox.focus();

    socket.on('artistmatched', function() {
      addFeedback(amstrings[Math.floor(Math.random()*amstrings.length)], 'correct');
    });
    socket.on('bothmatched', function() {
      addFeedback(bmstrings[Math.floor(Math.random()*bmstrings.length)], 'correct');
    });
    socket.on('chatmsg', getChatMessage);
    socket.on('gameover', gameOver);
    socket.on('loadtrack', loadTrack);
    socket.on('newuser', userJoin);
    socket.on('noguesstime', function() {
      addFeedback('You have to wait the next song...');
    });
    socket.on('nomatch', function() {
      addFeedback(nmstrings[Math.floor(Math.random()*nmstrings.length)], 'wrong');
    });
    socket.on('playtrack', playTrack);
    socket.on('stoptrying', function() {
      addFeedback('You guessed both artist and title. Please wait...');
    });
    socket.on('titlematched', function() {
      addFeedback(tmstrings[Math.floor(Math.random()*tmstrings.length)], 'correct');
    });
    socket.on('trackinfo', addTrackInfo);
    socket.on('updateusers', updateUsers);
    socket.on('userleft', userLeft);
    socket.emit('getstatus', setStatus);
  };

  // Show the number of players inside each room
  var roomsOverview = function(data) {
    for (var prop in data) {
      if (prop !== roomname) {
        DOM.userscounters[prop].text(data[prop]);
      }
    }
  };

  var setStatus = function(data) {
    if (data.status === 0) {
      cassetteAnimation(Date.now()+data.timeleft, true);
    }
    else if (data.status === 1) {
      loadTrack(data.previewUrl);
    }
    addFeedback(states[data.status]);
  };

  var setVariables = function() {
    DOM.cassettewheels = $('#cassette .wheel');
    DOM.chat = $('#chat');
    DOM.chatwrapper = $('#chat-outer-wrapper');
    DOM.countdown = $('#countdown');
    DOM.feedback = $('#feedback');
    DOM.guessbox = $('#guess');
    DOM.messagebox = $('#message');
    DOM.modal = $('#modal');
    DOM.points = $('#summary .points');
    DOM.progress = $('#progress');
    DOM.rank = $('#summary .rank');
    DOM.recipient = $('#recipient');
    DOM.tapeleft = $('#tape-left');
    DOM.taperight = $('#tape-right');
    DOM.togglechat = $('#toggle-chat');
    DOM.track = $('#summary .track');
    DOM.tracks = $('#tracks');
    DOM.users = $('#users');
    DOM.userscounters = {};
    $('.users-counter').each(function() {
      DOM.userscounters[$(this).prevAll('.room-name').text()] = $(this);
    });
  };

  var showChat = function() {
    DOM.togglechat.text('Hide chat').unbind('click');
    DOM.chatwrapper.toggle(300);
    DOM.tracks.animate({maxHeight:'240px'}, 300, function() {
      DOM.chat[0].scrollTop = DOM.chat[0].scrollHeight;
    });
    DOM.togglechat.click(hideChat);
  };

  var slashCommandHandler = function(line) {
    var args;
    var outcome = $('<span class="message private">(From binb): </span>');

    try {
      args = parseCommand(line);
    }
    catch (err) {
      outcome.append(err.message);
      return addChatEntry(outcome);
    }

    var cmdname = args.shift();
    var command = slashcommands[cmdname.substr(1)];

    if (command) {
      if (args.length < command.minargs) {
        outcome.append(command.usage);
        return addChatEntry(outcome);
      }
      if (command.checkrecipient && (!args[0] || args[0] === nickname)) {
        outcome.append('invalid argument.');
        return addChatEntry(outcome);
      }
      return command.fn(args, outcome);
    }

    outcome.text('(From binb): unknown command '+cmdname+'.');
    addChatEntry(outcome);
  };

  // Remove a player from the ignore list
  var unignorePlayer = function(args, outcome) {
    if (!ignoredplayers[args[0]]) {
      outcome.text('(From binb): you have not ignored '+args[0]+'.');
      return addChatEntry(outcome);
    }
    delete ignoredplayers[args[0]];
    socket.emit('unignore', args[0]);
    outcome.text('(From binb): '+args[0]+' is no longer ignored.');
    addChatEntry(outcome);
  };

  // Update the list of players
  var updateUsers = function(usersData) {
    DOM.users.empty();

    var users = [];
    for (var key in usersData) {
      users.push(usersData[key]);
    }
    users.sort(function(a, b) {return b.points - a.points;});

    // Flag to test if our private recipient is in the list of active users
    var found = false;
    for (var i=0; i<users.length; i++) {
      var user = users[i]
        , li = $('<li></li>')
        , pvt = $('<span class="private label label-info">P</span>')
        , username = $('<span class="name"></span>').text(user.nickname)
        , points = $('<span class="points">('+user.points+')</span>')
        , roundrank = $('<span></span>')
        , roundpointsel = $('<span class="round-points"></span>')
        , guesstime = $('<span class="guess-time"></span>');

      li.append(pvt, username, points, roundrank, roundpointsel, guesstime);
      if (user.registered) {
        var href = 'href="/user/'+user.nickname+'"';
        pvt.after('<a class="icons registered" target="_blank" '+href+'></a>');
      }
      DOM.users.append(li);

      if (pvtmsgto === user.nickname) {
        pvt.show();
        username.click(clearPrivate);
        found = true;
      }
      else {
        username.click(function() {
          addPrivate($(this).text());
        });
      }

      if (nickname === user.nickname) {
        username.addClass('you');
        roundpoints = user.roundpoints;
        DOM.rank.text(i+1);
        DOM.points.text(user.points);
      }

      if (user.roundpoints > 0) {
        roundpointsel.text('+'+user.roundpoints);
        if (user.roundpoints === 1) {
          username.addClass('matched');
        }
        else {
          if (user.roundpoints > 3) {
            var stand = 7 - user.roundpoints;
            roundrank.addClass('icons round-rank stand'+stand);
            var gtime = (user.guesstime / 1000).toFixed(1);
            guesstime.text(gtime+' s');
          }
          username.addClass('correct');
        }
      }
    }

    if (!found && pvtmsgto) {
      var width = DOM.recipient.outerWidth(true) + 1;
      DOM.recipient.css('margin-right', '0');
      DOM.recipient.text('');
      DOM.messagebox.animate({'width':'+='+width+'px'}, 'fast');
      pvtmsgto = null;
      DOM.messagebox.focus();
    }
  };

  var updateRoomsOverview = function(room, players) {
    if (room !== roomname) {
      DOM.userscounters[room].text(players);
    }
  };

  // Convert any URLs in text into clickable links
  var urlize = function(text) {
    if (urlregex.test(text)) {
      var html = '';
      var splits = text.split(urlregex);
      for (var i=0; i<splits.length; i++) {
        var escapedsplit = splits[i].encodeEntities();
        if (urlregex.test(splits[i])) {
          html += '<a target="_blank" href="'+escapedsplit+'">'+escapedsplit+'</a>';
          continue;
        }
        html += escapedsplit;
      }
      return html;
    }
    return text.encodeEntities();
  };

  // A new player has joined the game
  var userJoin = function(username, usersData) {
    var joinmsg = username+' joined the game';
    var joinspan = $('<span class="join"></span>');
    joinspan.text(joinmsg);
    addChatEntry(joinspan);
    updateUsers(usersData);
  };

  // A player has left the game
  var userLeft = function(username, usersData) {
    var leftmsg = username+' left the game';
    var leftspan = $('<span class="left"></span>');
    leftspan.text(leftmsg);
    addChatEntry(leftspan);
    updateUsers(usersData);
  };

  var slashcommands = {
    ignore: {
      checkrecipient: true, // Assume that the first argument (argv[0]) is the recipient
      fn: ignorePlayer,
      minargs: 1,
      usage: 'usage: /ignore &lt;player name&gt;'
    },
    kick: {
      checkrecipient: true,
      fn: kickPlayer,
      minargs: 1,
      usage: 'usage: /kick &lt;player name&gt; [message]'
    },
    unignore: {
      checkrecipient: true,
      fn: unignorePlayer,
      minargs: 1,
      usage: 'usage: /unignore &lt;player name&gt;'
    }
  };

  // Set up the app
  setVariables();
  DOM.modal.modal({keyboard:false, show:false, backdrop:'static'});
  DOM.togglechat.click(hideChat);
  // Prevent Firefox from closing the websocket connection if the ESC key is pressed
  $(document).keydown(function(e) {
    if (e.keyCode === 27) {
      e.preventDefault();
    }
  });
  socket = io.connect(uri, {'reconnect':false});
  socket.on('connect', function() {
    jplayer = $('#player').jPlayer({
      ready: jplayerReady,
      swfPath: '/static/swf/',
      supplied: 'm4a',
      preload: 'auto',
      volume: 1
    });
    socket.on('alreadyinaroom', alreadyInARoom);
    socket.on('disconnect', disconnect);
    socket.on('invalidnickname', invalidNickName);
    socket.on('ready', ready);
    socket.on('updateoverview', updateRoomsOverview);
    socket.emit('getoverview', roomsOverview);
  });

})();
