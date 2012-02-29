var App = {
	
	touchplay: null,
	elapsedtime: 0,
	jplayer: null,
	nickname: null,
	socket: null,
	pvtmgsto: null,
	roundpoints: 0,
	stopanimation: false,
	states: ['A song is alredy playing, please wait for the next one...',
			'Game is about to start...', 'Game is over', 'New game will start soon...'],
	tmstrings: ['Yes, you guessed the title. Who is the artist?', 'Now tell me the artist!',
					'Correct, do you also know the artist?'],
	amstrings: ['Yes, that\'s the artist. What about the title?', 'Exactly, now tell me the title!',
					'Do you also know the title?'],
	bmstrings: ['Yeah true! do you like this track?', 'Good job!', 'Great!',
					'Very well done!', 'Exactly!', 'Excellent!'],
	nmstrings: ['Nope, sorry!', 'No way!', 'Fail', 'Nope', 'No', 'That\'s wrong', 'What?!',
				'Wrong', 'Haha, what?!', 'You kidding?', 'Don\'t make me laugh', 'You mad?'],
	
	// Prompt for name and send it.
	setNickName: function(msg) {
		if (!msg) {
			msg = "What's your name?";

			var html = '<div class="modal-header"><h3>Welcome to Binb</h3></div>';
			html += '<div class="modal-body"><p>'+msg+'</p></div>';
			html += '<div class="modal-footer">';
			html += '<input id="login" class="" type="text" name="nickname" />';
			html += '<button id="join" class="btn btn-primary">';
			html += '<i class="icon-user icon-white"></i> Join the game</button></div>';

			$(html).appendTo($('#modal'));
			var login = $('#login');
			var button = $('#join');
			button.click(function() {
				var val = $.trim(login.val());
				if (val !== "") {
					App.nickname = val;
					App.socket.emit('setnickname', App.nickname);
				}
				else {
					var txt = "Nickname can't be empty.";
					App.invalidNickName({feedback:'<span class="label label-important">'+txt+'</span>'});
				}
				login.val("");
			});
			login.keyup(function(event) {
				if (event.keyCode === 13) {
					button.click();	
				}
			});
			$('#modal').modal('show');
			$('#modal').on('shown', function() {
				login.focus();	
			});
		}
		else {
			$('.modal-body p').html(msg);
			$('#login').focus();
		}
	},

	// Your submitted name was invalid
	invalidNickName: function(data) {
		App.setNickName(data.feedback+"<br/>Try again:");
	},
	
	// You joined the game
	ready: function(data) {
		$('#modal').modal('hide').empty();
		$('#total-tracks span').text(data.trackscount);
		var msg = App.nickname+" joined the game";
		var joinspan = $("<span class='join'></span>");
		joinspan.text(msg);
		App.addChatEntry(joinspan);
		App.updateUsers(data);

		var messagebox = $("#message");
		messagebox.keyup(function(event) {
			if (event.keyCode === 13) {
				var val = $.trim(messagebox.val());
				if (val !== "") {
					var data = (App.pvtmsgto) ? {to:App.pvtmsgto,chatmsg:val} : val;
					App.socket.emit('sendchatmsg', data);
				}
				messagebox.val("");
			}
		});
		var guessbox = $("#guess");
		guessbox.keyup(function(event) {
			if (event.keyCode === 13) {
				var val = $.trim(guessbox.val().toLowerCase());
				if (val !== "") {
					App.socket.emit('guess', val);
				}
				guessbox.val("");
			}
		});
		$("#guess").focus();
		
		App.socket.on('newuser', App.userJoin);
		App.socket.on('userleft', App.userLeft);
		App.socket.on('updateusers', App.updateUsers);
		App.socket.on('chatmsg', App.getChatMessage);
		App.socket.on('loadtrack', App.loadTrack);
		App.socket.on('playtrack', App.playTrack);
		App.socket.on('trackinfo', App.addTrackInfo);
		App.socket.on('artistmatched', function() {
			var feedback = App.amstrings[Math.floor(Math.random()*App.amstrings.length)];
			App.addFeedback(feedback, "correct");
		});
		App.socket.on('titlematched', function() {
			var feedback = App.tmstrings[Math.floor(Math.random()*App.tmstrings.length)];
			App.addFeedback(feedback, "correct");
		});
		App.socket.on('bothmatched', function() {
			var feedback = App.bmstrings[Math.floor(Math.random()*App.bmstrings.length)];
			App.addFeedback(feedback, "correct");
		});
		App.socket.on('nomatch', function() {
			var feedback = App.nmstrings[Math.floor(Math.random()*App.nmstrings.length)];
			App.addFeedback(feedback, "wrong");
		});
		App.socket.on('stoptrying', function() {
			App.addFeedback('You guessed both artist and title. Please wait...');
		});
		App.socket.on('noguesstime', function() {
			App.addFeedback('You have to wait the next song...', "wrong");
		});
		App.socket.on('gameover', App.gameOver);
		App.socket.on('status', App.setStatus);
		App.socket.emit('getstatus');
	},

	setStatus: function(data) {
		if (data.status === 0) {
			App.cassetteAnimation(Date.now()+data.timeleft, true);
		}
		if (data.status === 1) {
			App.loadTrack(data);
		}
		App.addFeedback(App.states[data.status]);
	},

	// A new player joined the game
	userJoin: function(data) {
		var msg = data.nickname+" joined the game";
		var joinspan = $("<span class='join'></span>");
		joinspan.text(msg);
		App.addChatEntry(joinspan);
		App.updateUsers(data);
	},

	// A user left the game
	userLeft: function(data) {
		var leftmsg = data.nickname+" left the game";
		var leftspan = $("<span class='left'></span>");
		leftspan.text(leftmsg);
		App.addChatEntry(leftspan);
		App.updateUsers(data);
	},

	// Update the list of users
	updateUsers: function(data) {
		var elem = $("#users");
		elem.empty();
		var users = [];
		for (var key in data.users) {
			users.push(data.users[key]);
		}
		users.sort(function(a, b) {return b.points - a.points;});
		// Flag to test if our private recipient is in the list of active users
		var found = false;
		for (var i=0; i<users.length; i++) {
			var user = users[i];
			var li = $('<li></li>');
			var pvt = $('<span class="private label label-info">P</span>');
			var username = $('<span class="name"></span>').text(user.nickname);
			var points = $('<span class="points">('+user.points+')</span>');
			var roundrank = $('<span></span>');
			var roundpoints = $('<span class="round-points"></span>');
			li.append(pvt, username, points, roundrank, roundpoints);
			elem.append(li);
			if (App.pvtmsgto === user.nickname) {
				pvt.show();
				username.click(App.clearPrivate);
				found = true;
			}
			else {
				username.click(function() {
					App.addPrivate($(this).text());
				});
			}
			if (App.nickname === user.nickname) {
				username.addClass("you");
				App.roundpoints = user.roundpoints;
				$('#summary .rank').text(i+1);
				$('#summary .points').text(user.points);
			}
			if (user.roundpoints > 0) {
				roundpoints.text('+'+user.roundpoints);
				if (user.roundpoints === 1) {
					username.addClass("matched");
				}
				else {
					if (user.roundpoints > 3) {
						var stand = 7 - user.roundpoints;
						roundrank.addClass("round-rank stand"+stand);
					}
					username.addClass("correct");
				}
			}
		}
		if (!found && App.pvtmsgto) {
			var recipient = $('#recipient');
			var width = recipient.outerWidth(true) + 1;
			recipient.css('margin-right','0');
			recipient.text("");
			$('#message').animate({'width':'+='+width+'px'}, "fast");
			App.pvtmsgto = null;
			$("#message").focus();
		}
	},
	
	addPrivate: function(nickname) {
		if (App.pvtmsgto) {
			App.clearPrivate();
		}
		if (App.nickname === nickname) {
			return;
		}
		var recipient = $("#recipient");
		recipient.css('margin-right','4px');
		recipient.text("To "+nickname+":");
		var width = recipient.outerWidth(true) + 1;
		recipient.hide();
		$('#message').animate({'width':'-='+width+'px'}, "fast", function() {recipient.show();});
		var el = $("span.name:contains("+nickname+")");
		el.prev().show();
		el.unbind('click');
		el.click(App.clearPrivate);
		App.pvtmsgto = nickname;
		$("#message").focus();
	},

	clearPrivate: function() {
		var recipient = $("#recipient");
		var width = recipient.outerWidth(true) + 1;
		recipient.css('margin-right','0');
		recipient.text("");
		$('#message').animate({'width':'+='+width+'px'}, "fast");
		var el = $("span.name:contains("+App.pvtmsgto+")");
		el.prev().hide();
		el.unbind("click");
		el.click(function() {
			App.addPrivate($(this).text());
		});
		App.pvtmsgto = null;
		$("#message").focus();
	},

	// Receive a chat message
	getChatMessage: function(data) {
		var prefix = data.from;
		var msgspan = $("<span class='message'></span>");
		if (data.to) {
			// Private Message
			prefix = (App.nickname === data.from) ? '(To '+data.to+')' : '(From '+prefix+')';
			msgspan.addClass("private");
		}
		var msg = prefix+": "+data.chatmsg;
		msgspan.text(msg);
		App.addChatEntry(msgspan);
	},

	loadTrack: function(data) {
		App.jplayer.jPlayer("mute");
		App.jplayer.jPlayer("setMedia", {m4a: data.previewUrl});
	},

	// Play a track 
	playTrack: function(data) {
		if (App.touchplay) {
			App.touchplay.removeClass("btn-danger disabled").addClass("btn-success");
			App.touchplay.html('<i class="icon-play icon-white"></i> Play');
		}
		App.jplayer.jPlayer("unmute");
		App.jplayer.jPlayer("play");
		App.updateUsers(data);
		App.cassetteAnimation(Date.now()+30000, true);
		if (data.counter === 1) {
			$('#modal').modal('hide').empty();
			$('#tracks').empty();
		}
		$('#summary .track').text(data.counter+'/'+data.tot);
		App.addFeedback('What is this song?');
	},

	// Start cassette animation
	cassetteAnimation: function(endtime, forward) {
		var millisleft = endtime - Date.now();
		var secleft = millisleft / 1000;
		var width, deg, offsetleft, offsetright, css;
		if (forward) {
			width = 148 - (148*secleft/30);
			deg = 360 - (360*secleft/30);
			offsetleft = 44 - 24*secleft/30;
			offsetright = 130 - 24*secleft/30;
			$('#progress').width(width);
			css = {
				'-moz-transform' : 'rotate('+deg+'deg)',
				'-webkit-transform' : 'rotate('+deg+'deg)',
				'-o-transform' : 'rotate('+deg+'deg)',
				'-ms-transform' : 'rotate('+deg+'deg)',
				'transform' : 'rotate('+deg+'deg)'
			};
			$('#cassette .wheel').css(css);
			$('#tape-left').css('left', offsetleft+'px');
			$('#tape-right').css('left', offsetright+'px');
		}
		else {
			width = 148*secleft/5;
			deg = 360*secleft/5;
			offsetleft = 20 + 24*secleft/5;
			offsetright = 106 + 24*secleft/5;
			$('#progress').width(width);
			css = {
				'-moz-transform' : 'rotate('+deg+'deg)',
				'-webkit-transform' : 'rotate('+deg+'deg)',
				'-o-transform' : 'rotate('+deg+'deg)',
				'-ms-transform' : 'rotate('+deg+'deg)',
				'transform' : 'rotate('+deg+'deg)'
			};
			$('#cassette .wheel').css(css);
			$('#tape-left').css('left', offsetleft+'px');
			$('#tape-right').css('left', offsetright+'px');
		}
		if (forward) {
			$('#countdown').text(secleft.toFixed(1));
			if (App.touchplay) {App.elapsedtime = 30 - Math.round(secleft);}
		}
		else {
			$('#countdown').text(Math.round(secleft));
		}
		if (App.stopanimation || millisleft < 50) {
			return;
		}
		setTimeout(function() {App.cassetteAnimation(endtime, forward);}, 50);
	},

	// Add track info
	addTrackInfo: function(data) {
		if (App.touchplay) {
			App.touchplay.removeClass("btn-success").addClass("btn-danger disabled");
			App.touchplay.html('<i class="icon-play icon-white"></i> Wait');
		}
		App.cassetteAnimation(Date.now()+5000, false);
		var html = '<li class="bordered"><img class="artwork" src="'+data.artworkUrl+'"/>';
		html += '<div class="info"><div class="artist">'+data.artistName+'</div>';
		var titleattr = '';
		var trackname = data.trackName;
		if (data.trackName.length > 45) {
			titleattr = data.trackName;
			trackname = data.trackName.substring(0,42) + '...';
		}
		html += '<div class="title" title="'+titleattr+'">'+trackname+'</div></div>';
		var attrs = '';
		var rp = '';
		if (App.roundpoints > 0) {
			rp = '+'+App.roundpoints;
			if (App.roundpoints > 3) {
				var stand = 7 - App.roundpoints;
				attrs += 'class="round-rank stand'+stand+'"';
			}
		}
		html += '<div '+attrs+'></div><div class="round-points">'+rp+'</div>';
		html += '<a target="_blank" href="'+data.trackViewUrl+'">';
		html += '<img src="/static/images/itunes.png"/></a></li>';
		$('#tracks').prepend($(html));
	},

	// Game over countdown
	countDown: function(endtime) {
		var millisleft = endtime - Date.now();
		var secleft = millisleft / 1000;
		$('.modal-footer span').text(Math.round(secleft));
		if (millisleft < 200) {
			return;
		}
		setTimeout(function() {App.countDown(endtime);}, 200);
	},

	gameOver: function(data) {
		var users = [];
		for (var key in data.users) {
			users.push(data.users[key]);
		}
		users.sort(function(a, b) {return b.points - a.points;});
		var html = '<div class="modal-header"><h3>Game Over</h3></div>';
		html += '<div class="modal-body">';
		for(var i=0;i<3;i++) {
			if (users[i]) {
				var rank = i+1;
				var offset = -16 + (-32 * i);
				var style = ' style="background:url(/static/images/sprites.png)';
				style += ' no-repeat 0px '+offset+'px;"';
				html += '<div class="gameover"'+style+'>'+rank+')';
				html += ' <span class="name">'+users[i].nickname;
				html += '</span>('+users[i].points+')</div>';
			}
		}
		html +='</div>';
		html += '<div class="modal-footer">A new game will start in <span></span> second/s</div>';
		$('#modal').append($(html));
		$('#modal').modal('show');
		App.countDown(Date.now()+10000);
	},

	// Let the user know when he / she has disconnected
	disconnect: function() {
		App.stopanimation = true;
		App.jplayer.jPlayer("stop");
		var errormsg = "ERROR: You have disconnected.";
		var errorspan = $("<span class='error'></span>");
		errorspan.text(errormsg);
		App.addChatEntry(errorspan);
		App.addFeedback('Something wrong happened');
		var users = $("#users");
		users.empty();
	},

	// Add a chat entry, whether message, notification, etc.
	addChatEntry: function(childNode) {
		var li = $("<li class='entry'></li>");
		li.append(childNode);
		var chat = $("#chat");
		chat.append(li);
		var chatRaw = document.getElementById("chat");
		chatRaw.scrollTop = chatRaw.scrollHeight;
	},

	addFeedback: function(txt, style) {
		if (typeof style === 'string') {
			var fbspan = $('<span class="'+style+'"></span>');
			fbspan.text(txt);
			$('#feedback').html(fbspan);
			return;
		}
		$('#feedback').text(txt);
	},

	addVolumeControl: function() {
		var volumebutton = $('<div id="volume-button">'+
								'<a class="button"><div id="icon" class="volume-high"></div></a>'+           
								'<div id="volume-slider">'+ // Outer background
									'<div id="volume-total"></div>'+ // Rail
									'<div id="volume-current"></div>'+ // Current volume
									'<div id="volume-handle"></div>'+ // Handle
								'</div>'+
							'</div>').appendTo("#volume");
		var icon = volumebutton.find('#icon');
		var volumeslider = volumebutton.find('#volume-slider');
		var volumetotal = volumebutton.find('#volume-total');
		var volumecurrent = volumebutton.find('#volume-current');
		var volumehandle = volumebutton.find('#volume-handle');
		var mouseisdown = false;
		var mouseisover = false;
		var oldvalue = 1;
		var clicked = false;

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
			volumehandle.css('top', totalposition.top + newtop - (volumehandle.height() / 2));
			volumecurrent.height(totalheight - newtop );
			volumecurrent.css('top', totalposition.top + newtop);
		};

		var handleIcon = function (volume) {
			if (volume === 0) {
				icon.removeClass().addClass('volume-none');
			}
			else if (volume <= 0.33) {
				icon.removeClass().addClass('volume-low');
			}
			else if (volume <= 0.66) {
				icon.removeClass().addClass('volume-medium');
			}
			else {
				icon.removeClass().addClass('volume-high');
			}
		};

		var setVolume = function(volume) {
			handleIcon(volume);
			oldvalue = volume;
			App.jplayer.jPlayer("volume", volume);
		};

		var handleVolumeMove = function(e) {
			var totaloffset = volumetotal.offset();
			var newy = e.pageY - totaloffset.top;
			var railheight = volumetotal.height();
			var totalTop = parseInt(volumetotal.css('top').replace(/px/,''),10);
			var volume = (railheight - newy) / railheight;		

			if (newy < 0) {
				newy = 0;
			}
			else if (newy > railheight) {
				newy = railheight;
			}

			volumehandle.css('top', totalTop + newy - (volumehandle.height() / 2));
			volumecurrent.height(railheight - newy);
			volumecurrent.css('top',newy+totalTop);

			volume = Math.max(0,volume);
			volume = Math.min(volume,1);

			setVolume(volume);
			document.cookie = "volume="+volume;
		};

		var loadFromCookie = function() {
			if (/volume\s*\=/.test(document.cookie)) {
				var value = document.cookie.replace(/.*volume\s*\=\s*([^;]*);?.*/, "$1");
				value = parseFloat(value);
				positionVolumeHandle(value);
				setVolume(value);
			}
			else {
				positionVolumeHandle(1);
			}
		};

		volumebutton.hover(function() {
			volumeslider.show();
			mouseisover = true;
		}, function() {
			mouseisover = false;
			if (!mouseisdown)    {
				volumeslider.hide();
			}
		});
		
		volumeslider.on('mouseover', function() {
			mouseisover = true;
		}).on('mousedown', function (e) {
			handleVolumeMove(e);
			mouseisdown = true;
			return false;
		});

		$(document).on('mouseup', function (e) {
			mouseisdown = false;
			if (!mouseisover) {
				volumeslider.hide();
			}
		}).on('mousemove', function (e) {
			if (mouseisdown) {
				handleVolumeMove(e);
			}
		});

		volumebutton.find('.button').click(function() {
			if (!clicked) {
				clicked = true;
				if (oldvalue !== 0) {
					App.jplayer.jPlayer("volume", 0);
					positionVolumeHandle(0);
					handleIcon(0);
				}
			}
			else {
				clicked = false;
				if (oldvalue !== 0) {
					App.jplayer.jPlayer("volume", oldvalue);
					positionVolumeHandle(oldvalue);
					handleIcon(oldvalue);
				}
			}
		});
		loadFromCookie();
	},

	// Set up the App object.
	init: function() {
		$('#modal').modal({keyboard:false,show:false,backdrop:"static"});
		if ($.browser.mozilla) {
			// Block ESC button in firefox (it breaks all socket connection).
			$(document).keypress(function(event) {
				if(event.keyCode === 27) {
					return false;
				}
			});
		}
		App.socket = io.connect("http://binb.nodejitsu.com/", {'reconnect':false});
		App.socket.on("connect", function() {
			App.jplayer = $("#player").jPlayer({
				ready: function() {
					App.setNickName();
					if (!$.jPlayer.platform.mobile && !$.jPlayer.platform.tablet) {
						App.addVolumeControl();
					}
					else {
						var touchbackdrop = $('<div id="touch-backdrop">'+
							'<button id="touch-play" class="btn btn-danger disabled">'+
								'<i class="icon-play icon-white"></i> Wait'+
							'</button></div>').appendTo("#cassette");
						App.touchplay = $('#touch-play');
						App.touchplay.click(function() {
							if (!$(this).hasClass("btn-danger")) {
								App.touchplay = null;
								App.jplayer.jPlayer('play', App.elapsedtime);
								touchbackdrop.remove();
							}
						});
					}
				},
				swfPath: "/static/swf/",
				supplied: "m4a",
				preload: "auto",
				volume: 1
			});
		});
		App.socket.on('invalidnickname', App.invalidNickName);
		App.socket.on('ready', App.ready);
		App.socket.on("disconnect", App.disconnect);
	}
};
