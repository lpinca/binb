(function() {
  'use strict';

  $.get('/artworks', function(data) {
    $('.thumbnail').each(function() {
      var $this = $(this);

      data[$this.attr('href')].forEach(function(url) {
        $('<img src="' + url + '" />').appendTo($this);
      }, $this);
    });
  });

  var primus = new Primus({ strategy: false });

  primus.on('overview', function(rooms) {
    Object.keys(rooms).forEach(function(room) {
      $('#' + room).text(rooms[room]);
    });
  });
  primus.on('updateoverview', function(room, players) {
    $('#' + room).text(players);
  });
})();
