$(function() {
	if ($.browser.mozilla) {
		// Block ESC button in firefox (it breaks all socket connection).
		$(document).keypress(function(event) {
			if(event.keyCode === 27) {
				return false;
			}
		});
	}
	var mottos = ['guess the song.', 'name that tune.', 'i know this track.'];
	var motto = mottos[Math.floor(Math.random()*mottos.length)];
	$('#app-name small').text(motto);
	$.get("/artworks", function(data) {
		$(".thumbnail").each(function(index) {
			var i = index * 6;
			var j = i + 6;
			for(i; i < j; i++) {
				$('<img src="'+data.results[i]+'" />').appendTo($(this));
			}
		});
	});
	var socket = io.connect("http://binb.nodejitsu.com/", {'reconnect':false});
	socket.on("connect", function() {
		socket.emit("getoverview");
		socket.on("overview", function(data) {
			for (var prop in data) {
				$("#"+prop).text(data[prop]);
			}
		});
		socket.on("update", function(data) {
			$("#"+data.room).text(data.players);
		});
	});
});
