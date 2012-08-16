$(function() {
    if ($.browser.mozilla) {
        // Block ESC button in firefox (breaks socket connections).
        $(document).keypress(function(event) {
            if(event.keyCode === 27) {
                return false;
            }
        });
    }
    $.get("/artworks", function(data) {
        $(".thumbnail").each(function(index) {
            var i = index * 6;
            var j = i + 6;
            for(i; i < j; i++) {
                $('<img src="'+data.results[i]+'" />').appendTo($(this));
            }
        });
    });
    var socket = io.connect('http://'+window.location.host, {'reconnect':false});
    socket.on("connect", function() {
        socket.emit("getoverview");
        socket.on("overview", function(data) {
            for (var prop in data) {
                $("#"+prop).text(data[prop]);
            }
        });
        socket.on("update", function(room, players) {
            $("#"+room).text(players);
        });
    });
});
