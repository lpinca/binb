(function() {
  'use strict';

  $.get('/artworks', function(data) {
    $('.thumbnail').each(function() {
      var urls = data[$(this).attr('href')];
      for (var i = 0; i < urls.length; i++) {
        $('<img src="' + urls[i] + '" />').appendTo($(this));
      }
    });
  });

  var primus = new Primus({ strategy: false });

  primus.on('updateoverview', function(room, players) {
    $('#' + room).text(players);
  });
})();
