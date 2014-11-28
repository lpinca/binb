(function() {

  var $cassettewheels = $('#cassette .wheel')
    , $chat = $('#chat')
    , $chatwrapper = $('#chat-outer-wrapper')
    , $countdown = $('#countdown')
    , $feedback = $('#feedback')
    , $guessbox = $('#guess')
    , $jplayer
    , $messagebox = $('#message')
    , $modal = $('#modal')
    , $points = $('#summary .points')
    , $progress = $('#progress')
    , $rank = $('#summary .rank')
    , $recipient = $('#recipient')
    , $tapeleft = $('#tape-left')
    , $taperight = $('#tape-right')
    , $togglechat = $('#toggle-chat')
    , $touchplay
    , $track = $('#summary .track')
    , $tracks = $('#tracks')
    , $users = $('#users')
    , elapsedtime = 0
    , historycursor = 0
    , historyvalues = []
    , ignoredplayers = {}
    , isplaying
    , nickname
    , primus
    , pvtmsgto
    , roomname = location.pathname.replace(/\//g, '')
    , roundpoints = 0
    , subscriber = false
    , timer
    , urlregex = /(https?:\/\/[\-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[\-A-Za-z0-9+&@#\/%=~_()|])/
    , userscounters = {};

  var amstrings = [
    'Do you also know the title?'
    , 'Exactly, now tell me the title!'
    , 'Yes, that\'s the artist. What about the title?'
  ];

  var bmstrings = [
    'Congratulations'
    , 'Exactly'
    , 'Excellent'
    , 'Good job!'
    , 'Great!'
    , 'I\'m proud of you'
    , 'Keep it up!'
    , 'Perfect'
    , 'Super duper'
    , 'That\'s it!'
    , 'Very well done'
    , 'Woohoo!'
    , 'Yeah true, do you like this track?'
    , 'Yes, you\'re right'
    , 'You make it look easy'
    , 'You remembered'
    , 'You rock!'
  ];

  var nmstrings = [
    'Are you kidding?'
    , 'Don\'t give up'
    , 'Fail'
    , 'Haha, what?!'
    , 'Incorrect answer'
    , 'It is not that hard'
    , 'Keep trying'
    , 'No way!'
    , 'No'
    , 'Nope'
    , 'Nope, sorry!'
    , 'Oh, come on!'
    , 'That\'s wrong'
    , 'Try again'
    , 'What?!'
    , 'Wrong'
  ];

  var states = [
    'A song is already playing, please wait for the next one...'
    , 'Game is about to start...'
    , 'Game is over'
    , 'New game will start soon...'
  ];

  var tmstrings = [
    'Correct, do you also know the artist?'
    , 'Now tell me the artist!'
    , 'Yes, you guessed the title. Who is the artist?'
  ];

  String.prototype.encodeEntities = function() {
    return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  // Add a chat entry, whether message, notification, etc.
  var addChatEntry = function($childNode) {
    var $entry = $('<li class="entry"></li>');
    $entry.append($childNode);
    $chat.append($entry);
    $chat[0].scrollTop = $chat[0].scrollHeight;
  };

  var addFeedback = function(txt, style) {
    $feedback.removeClass().text(txt);

    if (style) {
      $feedback.addClass(style);
      $guessbox.addClass(style);

      setTimeout(function() {
        $guessbox.removeClass(style);
      }, 350);
    }
  };

  var addPrivate = function(usrname) {
    $messagebox.focus();

    if (pvtmsgto) {
      clearPrivate();
    }

    if (nickname === usrname) {
      return;
    }

    pvtmsgto = usrname;

    $recipient.css('margin-right', '4px');
    $recipient.text('To ' + usrname + ':');
    var width = $recipient.outerWidth(true) + 1;
    $recipient.hide();
    $messagebox.animate({ 'width': '-=' + width + 'px' }, 'fast', function() {
      $recipient.show();
    });

    var $el = $('.name').filter(function() {
      return $(this).text() === usrname;
    });
    $el.prevAll('.private').show();
    $el.off('click').on('click', clearPrivate);
  };

  // Add track info
  var addTrackInfo = function(data) {
    if ($touchplay) {
      $touchplay.removeClass('btn-success').addClass('btn-danger disabled');
      $touchplay.html('<i class="icon-play icon-white"></i> Wait');
    }

    isplaying = false;
    clearInterval(timer);
    cassetteAnimation(Date.now() + 5000, false);

    var artistName = data.artistName.replace(/"/g, '&quot;')
      , trackName = data.trackName.replace(/"/g, '&quot;')
      , attrs = ''
      , rp = '';

    if (roundpoints > 0) {
      rp = '+' + roundpoints;
      if (roundpoints > 3) {
        var stand = 7 - roundpoints;
        attrs += 'class="icons round-rank stand' + stand + '"';
      }
    }

    var html = [
      '<li class="bordered">'
      , '<img class="artwork" src="' + data.artworkUrl + '"/>'
      , '<div class="info">'
      , '<div class="artist" title="' + artistName + '">' + artistName + '</div>'
      , '<div class="title" title="' + trackName + '">' + trackName + '</div>'
      , '</div>'
      , '<div ' + attrs + '></div>'
      , '<div class="round-points">' + rp + '</div>'
      , '<a class="icons" target="itunes_store" href="' + data.trackViewUrl + '"></a>'
      , '</li>'
    ].join('');

    $tracks.prepend(html);
  };

  var addVolumeControl = function() {
    var html = [
      '<div id="volume-button">'
      , '<a class="button">'
      , '<div id="icon" class="icons volume-high"></div>'
      , '</a>'
      , '<div id="volume-slider">'        // Outer background
      , '<div id="volume-total"></div>'   // Rail
      , '<div id="volume-current"></div>' // Current volume
      , '<div id="volume-handle"></div>'  // Handle
      , '</div>'
      , '</div>'
    ].join('');

    var $volumebutton = $(html)
      , $icon = $volumebutton.find('#icon')
      , $volumecurrent = $volumebutton.find('#volume-current')
      , $volumehandle = $volumebutton.find('#volume-handle')
      , $volumeslider = $volumebutton.find('#volume-slider')
      , $volumetotal = $volumebutton.find('#volume-total')
      , clicked = false
      , mouseisdown = false
      , mouseisover = false
      , oldvalue = 1;

    $volumebutton.appendTo('#volume');

    var handleIcon = function(volume) {
      if (volume === 0) {
        $icon.removeClass().addClass('icons volume-none');
      }
      else if (volume <= 0.33) {
        $icon.removeClass().addClass('icons volume-low');
      }
      else if (volume <= 0.66) {
        $icon.removeClass().addClass('icons volume-medium');
      }
      else {
        $icon.removeClass().addClass('icons volume-high');
      }
    };

    var handleVolumeMove = function(e) {
      var railheight = $volumetotal.height()
        , totaloffset = $volumetotal.offset()
        , totalTop = parseInt($volumetotal.css('top').replace(/px/, ''), 10)
        , newy = e.pageY - totaloffset.top
        , volume = (railheight - newy) / railheight;

      clicked = false;

      if (newy < 0) {
        newy = 0;
      }
      else if (newy > railheight) {
        newy = railheight;
      }

      $volumecurrent.height(railheight - newy);
      $volumecurrent.css('top', newy + totalTop);
      $volumehandle.css('top', totalTop + newy - ($volumehandle.height() / 2));

      volume = Math.max(0, volume);
      volume = Math.min(volume, 1);

      setVolume(volume);
    };

    var positionVolumeHandle = function(volume) {
      if (!$volumeslider.is(':visible')) {
        $volumeslider.show();
        positionVolumeHandle(volume);
        return $volumeslider.hide();
      }

      var totalheight = $volumetotal.height()
        , totalposition = $volumetotal.position()
        , newtop = totalheight - (totalheight * volume);

      $volumecurrent.height(totalheight - newtop );
      $volumecurrent.css('top', totalposition.top + newtop);
      $volumehandle.css('top', totalposition.top + newtop - ($volumehandle.height() / 2));
    };

    var setCookie = function(volume) {
      var d = new Date();
      d.setTime(d.getTime() + 31536000000); // One year in milliseconds
      document.cookie = 'volume=' + volume + ';path=/;expires=' + d.toGMTString() + ';';
    };

    var setVolume = function(volume) {
      handleIcon(volume);
      $jplayer.jPlayer('volume', volume);
      oldvalue = volume;
      setCookie(volume);
    };

    $volumebutton.find('.button').on('click', function() {
      if (!clicked) {
        clicked = true;

        if (oldvalue !== 0) {
          handleIcon(0);
          $jplayer.jPlayer('volume', 0);
          positionVolumeHandle(0);
        }
        return;
      }

      clicked = false;

      if (oldvalue !== 0) {
        handleIcon(oldvalue);
        $jplayer.jPlayer('volume', oldvalue);
        positionVolumeHandle(oldvalue);
      }
    });

    $volumebutton.hover(function() {
      mouseisover = true;
      $volumeslider.show();
    }, function() {
      mouseisover = false;
      if (!mouseisdown) {
        $volumeslider.hide();
      }
    });

    $volumeslider.on('mouseover', function() {
      mouseisover = true;
    }).on('mousedown', function(e) {
      handleVolumeMove(e);
      mouseisdown = true;
      return false;
    });

    $(document).on('mouseup', function() {
      mouseisdown = false;
      if (!mouseisover) {
        $volumeslider.hide();
      }
    }).on('mousemove', function(e) {
      if (mouseisdown) {
        handleVolumeMove(e);
      }
    });

    (function() {
      if (/volume\s*\=/.test(document.cookie)) {
        var value = document.cookie.replace(/.*volume\s*\=\s*([^;]*);?.*/, '$1');
        value = parseFloat(value);
        positionVolumeHandle(value);
        return setVolume(value);
      }

      positionVolumeHandle(1);
    })();
  };

  // Called when a registered user already in a room, tries to enter in another room
  var alreadyInARoom = function() {
    var html = [
      '<div class="modal-header">'
      , '<h3>Already in a room</h3>'
      , '</div>'
      , '<div class="modal-body">'
      , '<div class="alert alert-error alert-block">'
      , '<h4 class="alert-heading">Warning!</h4>'
      , 'You are already in a room.<br/>'
      , 'Leave the other room and refresh this page or close this one.'
      , '</div>'
      , '</div>'
    ].join('');

    $(html).appendTo($modal);
    $modal.modal('show');
  };

  // Start cassette animation
  var cassetteAnimation = function(endtime, forward) {
    var deg
      , factor
      , millisleft
      , offsetleft
      , offsetright
      , secleft
      , step
      , width;

    (step = function() {
      millisleft = endtime - Date.now();
      secleft = millisleft / 1000;

      if (millisleft < 50) {
        return clearInterval(timer);
      }

      if (forward) {
        if ($touchplay) {
          elapsedtime = 30 - Math.round(secleft);
        }
        $countdown.text(secleft.toFixed(1));
        factor = secleft / 30;
        width = 148 - 148 * factor;
        deg = -360 + 360 * factor;
        offsetleft = 20 + 24 * factor;
        offsetright = 106 + 24 * factor;
      }
      else {
        $countdown.text(Math.round(secleft));
        factor = secleft / 5;
        width = 148 * factor;
        deg = -360 * factor;
        offsetleft = 44 - 24 * factor;
        offsetright = 130 - 24 * factor;
      }

      $cassettewheels.css('transform', 'rotate(' + deg + 'deg)');
      $progress.width(width);
      $tapeleft.css('left', offsetleft + 'px');
      $taperight.css('left', offsetright + 'px');
    })();

    timer = setInterval(step, 50);
  };

  var clearPrivate = function() {
    var width = $recipient.outerWidth(true) + 1;
    $recipient.css('margin-right', '0');
    $recipient.text('');
    $messagebox.animate({ 'width': '+=' + width + 'px' }, 'fast');

    var $el = $('.name').filter(function() {
      return $(this).text() === pvtmsgto;
    });
    $el.prevAll('.private').hide();
    $el.off('click').on('click', function() {
      addPrivate($(this).text());
    });

    pvtmsgto = '';
    $messagebox.focus();
  };

  // Game over countdown
  var countDown = function(endtime) {
    var millisleft = endtime - Date.now()
      , secleft = millisleft / 1000;

    $('.modal-footer span').text(Math.round(secleft));

    if (millisleft < 200) {
      return;
    }

    setTimeout(function() {
      countDown(endtime);
    }, 200);
  };

  // Let the user know when he/she has disconnected
  var disconnect = function() {
    clearInterval(timer);
    $jplayer.jPlayer('stop');
    addChatEntry($('<span class="error">ERROR: You have disconnected.</span>'));
    addFeedback('Something wrong happened');
    $users.empty();
  };

  var gameOver = function(podium) {
    var html = [
      '<div class="modal-header">'
      , '<h3>Game Over</h3>'
      , '</div>'
      , '<div class="modal-body">'
      , '<table class="table table-striped scoreboard">'
      , '<thead>'
      , '<tr>'
      , '<th>#</th>'
      , '<th>Name</th>'
      , '<th>Points</th>'
      , '<th><div class="icons cups stand1"></div></th>'
      , '<th><div class="icons cups stand2"></div></th>'
      , '<th><div class="icons cups stand3"></div></th>'
      , '<th>Guessed</th>'
      , '<th>Mean time</th>'
      , '</tr>'
      , '</thead>'
      , '<tbody>'
    ];

    podium.forEach(function(player, i) {
      html.push('<tr>');
      html.push('<td><div class="icons medals rank' + (i + 1) + '"></div></td>');
      html.push('<td class="name">' + player.nickname + '</td>');
      html.push('<td>' + player.points + '</td>');
      html.push('<td>' + player.golds + '</td>');
      html.push('<td>' + player.silvers + '</td>');
      html.push('<td>' + player.bronzes + '</td>');
      html.push('<td>' + player.guessed + '</td>');

      var meantime = 'N/A';
      if (player.guessed !== 0) {
        meantime = player.totguesstime / player.guessed;
        meantime = (meantime / 1000).toFixed(1) + ' s';
      }

      html.push('<td>' +meantime + '</td>');
      html.push('</tr>');
    });

    html.push('</tbody>', '</table>', '</div>');
    html.push('<div class="modal-footer align-left">');
    html.push('A new game will start in <span></span> second/s');
    html.push('</div>');

    $modal.append(html.join('')).modal('show');
    countDown(Date.now() + 10000);
  };

  // Receive a chat message
  var getChatMessage = function(chatmsg, from, to) {
    if (ignoredplayers[from]) {
      return;
    }

    var $message = $('<span class="message"></span>')
      , prefix = from;

    if (to) {
      // Private Message
      prefix = '(' + (nickname === from ? 'To ' + to : 'From ' + prefix) + ')';
      $message.addClass('private');
    }

    var msg = prefix + ': ' + chatmsg.replace(/<3/g, '♥');
    $message.html(urlize(msg));
    addChatEntry($message);
  };

  var hideChat = function() {
    $chatwrapper.toggle(300);
    $togglechat.text('Show chat');
    $togglechat.off('click').on('click', showChat);
    $tracks.animate({ maxHeight: '434px' }, 300);
  };

  // Put a player in the ignore list
  var ignorePlayer = function(args, $outcome) {
    if (ignoredplayers[args[0]]) {
      $outcome.text('(From binb): ' + args[0] + ' is already ignored.');
      return addChatEntry($outcome);
    }

    primus.send('ignore', args[0], function(ignored, player) {
      if (ignored) {
        ignoredplayers[player] = true;
        $outcome.text('(From binb): ' + player + ' is now ignored.');
        return addChatEntry($outcome);
      }

      $outcome.append('player not found.');
      addChatEntry($outcome);
    });
  };

  // Submitted name was invalid
  var invalidNickName = function(feedback) {
    feedback = '<span class="label label-important">' + feedback + '</span>';
    joinUnauthenticated(feedback + '<br/>Try with another one:');
  };

  // Prompt for name and send it
  var joinUnauthenticated = function(msg) {
    if (/nickname\s*\=/.test(document.cookie) && !msg) {
      nickname = document.cookie.replace(/.*nickname\s*\=\s*([^;]*);?.*/, '$1');
      return primus.send('joinunauthenticated', nickname, roomname);
    }

    if ($modal.hasClass('in')) {
      $('.modal-body p').html(msg);
      return $('#login').focus();
    }

    var html = [
      '<div class="modal-header">'
      , '<h3>You are joining the ' + roomname + ' room</h3>'
      , '</div>'
      , '<div class="modal-body">'
      , '<p>' + (msg || 'What\'s your name?') + '</p>'
      , '</div>'
      , '<div class="modal-footer relative">'
      , '<input id="login" maxlength="15" type="text" name="nickname" />'
      , '<button id="join" class="btn btn-success">'
      , '<i class="icon-user icon-white"></i> Join the game'
      , '</button>'
      , '<span class="divider">'
      , '<span>or</span>'
      , '</span>'
      , '<a class="btn btn-primary" href="/login?followup=/' + roomname + '">'
      , '<i class="icon-lock icon-white"></i> Login'
      , '</a>'
      , '</div>'
    ].join('');

    $(html).appendTo($modal);

    var $button = $('#join')
      , $login = $('#login');

    $button.on('click', function() {
      var value = $login.val();
      $login.val('');

      if ($.trim(value)) {
        nickname = value;
        return primus.send('joinunauthenticated', nickname, roomname);
      }

      invalidNickName('Nickname can\'t be empty.');
    });

    $login.on('keyup', function(event) {
      if (event.keyCode === 13) {
        $button.click();
      }
    });

    $modal.modal('show').on('shown', function() {
      $login.focus();
    });
  };

  var jplayerReady = function() {
    primus.send('loggedin', function(isloggedin, loggedinas) {
      if (isloggedin) {
        nickname = loggedinas;
        subscriber = true;
        return primus.send('joinauthenticated', roomname);
      }

      joinUnauthenticated();
    });

    if (!$.jPlayer.platform.mobile && !$.jPlayer.platform.tablet) {
      return addVolumeControl();
    }

    var html = [
      '<div id="touch-backdrop">'
      , '<button id="touch-play" class="btn btn-danger disabled">'
      , '<i class="icon-play icon-white"></i> Wait'
      , '</button>'
      , '</div>'
    ].join('');

    var $touchbackdrop = $(html);
    $touchbackdrop.appendTo('#cassette');

    $touchplay = $('#touch-play');
    $touchplay.on('click', function() {
      if (!$(this).hasClass('btn-danger')) {
        $jplayer.jPlayer('play', elapsedtime);
        $touchbackdrop.remove();
        $touchplay = null;
      }
    });
  };

  var loadTrack = function(previewUrl) {
    $jplayer.jPlayer('mute');
    $jplayer.jPlayer('setMedia', { m4a: previewUrl });
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
    if ($touchplay) {
      $touchplay.html('<i class="icon-play icon-white"></i> Play');
      $touchplay.removeClass('btn-danger disabled').addClass('btn-success');
    }

    $jplayer.jPlayer('unmute');
    $jplayer.jPlayer('play');
    $guessbox.val('');
    isplaying = true;
    clearInterval(timer);
    cassetteAnimation(Date.now() + 30000, true);
    updateUsers(data.users);

    if (data.counter === 1) {
      $modal.modal('hide').empty();
      $tracks.empty();
    }

    $track.text(data.counter + '/' + data.tot);
    addFeedback('What is this song?');
  };

  // Return a function that will kick or ban a player
  var punishPlayer = function(punishment) {
    return function(tokens, $outcome) {
      $outcome.append('you are not allowed to ' + punishment + ' a player.');
      if (!subscriber) {
        return addChatEntry($outcome);
      }

      var args = [punishment, tokens[0]];

      if (punishment === 'kick') {
        args.push(tokens[1] || '');
      }
      else if (!tokens[1]) {
        args.push('', '');
      }
      else if (!tokens[2]) {
        if (/^[1-9][0-9]*$/.test(tokens[1])) {
          args.push('', tokens[1]);
        }
        else {
          args.push(tokens[1], '');
        }
      }
      else {
        args.push(tokens[1], tokens[2]);
      }

      args.push(function(success) {
        if (!success) {
          addChatEntry($outcome);
        }
      });

      primus.send.apply(primus, args);
    };
  };

  // Return a function that will add a random text from the given set, with the given style
  var randomFeedback = function(set, style) {
    var card = set.length;

    return function() {
      var index =  Math.floor(Math.random() * card)
        , text = set[index];

      addFeedback(text, style);
    };
  };

  // Successfully joined the room
  var ready = function(usersData, trackscount, loggedin) {
    if (!loggedin && !/nickname\s*\=/.test(document.cookie)) {
      document.cookie = 'nickname=' + nickname + ';path=/;';
    }

    $modal.modal('hide').empty();
    $('#total-tracks span').text(trackscount);

    var $entry = $('<span class="join">' + nickname + ' joined the game</span>');
    addChatEntry($entry);
    updateUsers(usersData);

    $messagebox.on('keydown', function(event) {
      if (event.keyCode === 13) {
        var value = $.trim($messagebox.val());
        $messagebox.val('');

        if (value) {
          if (pvtmsgto) {
            return primus.send('chatmsg', value, pvtmsgto);
          }

          if (/^\/[^ ]/.test(value)) {
            return slashCommandHandler(value);
          }

          primus.send('chatmsg', value);
        }
      }
    });

    $guessbox.on('keydown', function(event) {
      switch (event.keyCode) {
        case 13: // return
          var guess = $.trim($guessbox.val());
          $guessbox.val('');

          if (guess) {
            historyvalues.push(guess);
            if (historyvalues.length > 20) {
              historyvalues.splice(0, 1);
            }
            historycursor = historyvalues.length;

            if (isplaying) {
              return primus.send('guess', guess.toLowerCase());
            }

            addFeedback('You have to wait the next song...');
          }

          break;
        case 38: // up-arrow
          if (historycursor > 0) {
            $guessbox.val(historyvalues[--historycursor]);
          }

          // Prevent default action to keep the cursor at the end of the word
          return false;
        case 40: // down-arrow
          if (historycursor < historyvalues.length - 1) {
            return $guessbox.val(historyvalues[++historycursor]);
          }

          historycursor = historyvalues.length;
          $guessbox.val('');
      }
    }).on('paste', function(event) {
      event.preventDefault();
    }).focus();

    primus.on('artistmatched', randomFeedback(amstrings, 'correct'));
    primus.on('bothmatched', randomFeedback(bmstrings, 'correct'));
    primus.on('chatmsg', getChatMessage);
    primus.on('gameover', gameOver);
    primus.on('loadtrack', loadTrack);
    primus.on('newuser', userJoin);
    primus.on('nomatch', randomFeedback(nmstrings, 'wrong'));
    primus.on('playtrack', playTrack);
    primus.on('stoptrying', function() {
      addFeedback('You guessed both artist and title. Please wait...');
    });
    primus.on('titlematched', randomFeedback(tmstrings, 'correct'));
    primus.on('trackinfo', addTrackInfo);
    primus.on('updateusers', updateUsers);
    primus.on('userleft', userLeft);
    primus.send('getstatus', setStatus);
  };

  // Show the number of players inside each room
  var roomsOverview = function(data) {
    $('.users-counter').each(function() {
      var room = $(this).prevAll('.room-name').text();
      userscounters[room] = $(this);
      $(this).text(data[room]);
    });

    primus.on('updateoverview', updateRoomsOverview);
  };

  var setStatus = function(data) {
    if (data.status === 0) {
      isplaying = true;
      cassetteAnimation(Date.now() + data.timeleft, true);
    }
    else if (data.status === 1) {
      loadTrack(data.previewUrl);
    }

    addFeedback(states[data.status]);
  };

  var showChat = function() {
    $chatwrapper.toggle(300);
    $togglechat.text('Hide chat');
    $togglechat.off('click').on('click', hideChat);
    $tracks.animate({ maxHeight: '240px' }, 300, function() {
      $chat[0].scrollTop = $chat[0].scrollHeight;
    });
  };

  var slashCommandHandler = function(line) {
    var $outcome = $('<span class="message private">(From binb): </span>')
      , args;

    try {
      args = parseCommand(line);
    }
    catch (err) {
      $outcome.append(err.message);
      return addChatEntry($outcome);
    }

    var cmdname = args.shift()
      , command = slashcommands[cmdname.substr(1)];

    if (command) {
      if (args.length < command.minargs) {
        $outcome.append(command.usage);
        return addChatEntry($outcome);
      }

      if (command.checkrecipient && (!args[0] || args[0] === nickname)) {
        $outcome.append('invalid argument.');
        return addChatEntry($outcome);
      }

      return command.fn(args, $outcome);
    }

    $outcome.text('(From binb): unknown command ' + cmdname + '.');
    addChatEntry($outcome);
  };

  // Unban a player
  var unbanPlayer = function(args, $outcome) {
    $outcome.append('you are not allowed to unban a player.');
    if (!subscriber) {
      return addChatEntry($outcome);
    }

    primus.send('unban', args[0], function(success) {
      if (!success) {
        addChatEntry($outcome);
      }
    });
  };

  // Remove a player from the ignore list
  var unignorePlayer = function(args, $outcome) {
    if (!ignoredplayers[args[0]]) {
      $outcome.text('(From binb): you have not ignored ' + args[0] + '.');
      return addChatEntry($outcome);
    }

    delete ignoredplayers[args[0]];
    primus.send('unignore', args[0]);
    $outcome.text('(From binb): ' + args[0] + ' is no longer ignored.');
    addChatEntry($outcome);
  };

  // Update the list of players
  var updateUsers = function(usersData) {
    $users.empty();

    var users = [];
    for (var key in usersData) {
      users.push(usersData[key]);
    }
    users.sort(function(a, b) {
      return b.points - a.points;
    });

    // Flag to test if our private recipient is in the list of active users
    var found = false;

    users.forEach(function(user, index) {
      var $guesstime = $('<span class="guess-time"></span>')
        , $li = $('<li></li>')
        , $pnts = $('<span class="points">(' + user.points + ')</span>')
        , $pvt = $('<span class="private label label-info">P</span>')
        , $roundpoints = $('<span class="round-points"></span>')
        , $roundrank = $('<span></span>')
        , $username = $('<span class="name">' + user.nickname + '</span>');

      $li.append($pvt, $username, $pnts, $roundrank, $roundpoints, $guesstime);

      if (user.registered) {
        var href = 'href="/user/' + user.nickname + '"';
        $pvt.after('<a class="icons registered" target="_blank" ' + href + '></a>');
      }

      $users.append($li);

      if (pvtmsgto === user.nickname) {
        $pvt.show();
        $username.on('click', clearPrivate);
        found = true;
      }
      else {
        $username.on('click', function() {
          addPrivate($(this).text());
        });
      }

      if (nickname === user.nickname) {
        $points.text(user.points);
        $rank.text(index + 1);
        $username.addClass('you');
        roundpoints = user.roundpoints;
      }

      if (user.roundpoints > 0) {
        $roundpoints.text('+' + user.roundpoints);

        if (user.matched === 'artist' || user.matched === 'title') {
          return $username.addClass('matched' + user.matched);
        }

        $username.addClass('correct');

        if (user.roundpoints > 3) {
          $guesstime.text((user.guesstime / 1000).toFixed(1) +' s');
          $roundrank.addClass('icons round-rank stand' + (7 - user.roundpoints));
        }
      }
    });

    if (!found && pvtmsgto) {
      pvtmsgto = '';

      var width = $recipient.outerWidth(true) + 1;
      $recipient.css('margin-right', '0');
      $recipient.text('');
      $messagebox.animate({ 'width': '+=' + width + 'px' }, 'fast');
    }
  };

  var updateRoomsOverview = function(room, players) {
    if (room !== roomname) {
      userscounters[room].text(players);
    }
  };

  // Convert any URLs in text into clickable links
  var urlize = function(text) {
    if (urlregex.test(text)) {
      var html = ''
        , splits = text.split(urlregex);

      for (var i = 0; i < splits.length; i++) {
        var escapedsplit = splits[i].encodeEntities();

        if (urlregex.test(splits[i])) {
          html += '<a target="_blank" href="' + escapedsplit + '">' +
            escapedsplit + '</a>';
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
    var $entry = $('<span class="join">' + username +' joined the game</span>');
    addChatEntry($entry);
    updateUsers(usersData);
  };

  // A player has left the game
  var userLeft = function(username, usersData) {
    var $entry = $('<span class="left">' + username +' left the game</span>');
    addChatEntry($entry);
    updateUsers(usersData);
  };

  var slashcommands = {
    ban: {
      checkrecipient: true,
      fn: punishPlayer('ban'),
      minargs: 1,
      usage: 'usage: /ban &lt;player&gt; [&lt;message&gt;] [&lt;duration&gt;]'
    },
    clear: {
      fn: function() {
        $chat.empty();
      },
      minargs: 0
    },
    ignore: {
      checkrecipient: true,
      fn: ignorePlayer,
      minargs: 1,
      usage: 'usage: /ignore &lt;player&gt;'
    },
    kick: {
      checkrecipient: true,
      fn: punishPlayer('kick'),
      minargs: 1,
      usage: 'usage: /kick &lt;player&gt; [&lt;message&gt;]'
    },
    unban: {
      fn: unbanPlayer,
      minargs: 1,
      usage: 'usage: /unban &lt;IP&gt;|list'
    },
    unignore: {
      checkrecipient: true,
      fn: unignorePlayer,
      minargs: 1,
      usage: 'usage: /unignore &lt;player&gt;'
    }
  };

  $modal.modal({
    backdrop: 'static',
    keyboard: false,
    show: false
  });

  $togglechat.click(hideChat);

  // Open the realtime connection
  primus = Primus.connect({ strategy: false });
  primus.on('open', function() {
    $jplayer = $('#player').jPlayer({
      ready: jplayerReady,
      swfPath: '//cdn.jsdelivr.net/jplayer/2.8/Jplayer.swf',
      supplied: 'm4a',
      preload: 'auto',
      volume: 1
    });
    primus.on('alreadyinaroom', alreadyInARoom);
    primus.on('close', disconnect);
    primus.on('invalidnickname', invalidNickName);
    primus.on('ready', ready);
    primus.send('getoverview', roomsOverview);
  });

})();
