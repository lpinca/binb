(function() {
  'use strict';

  var appendResults = function(data, $leaderboard, offset, type) {
    for (var i = 0; i < data.length; i += 2) {
      var col1 = '<td>' + ++offset + '</td>';
      var col2 = '<td><a href="/user/' + data[i] + '">' + data[i] + '</a></td>';
      var col3 =
        type === 'points'
          ? '<td>' + data[i + 1] + '</td>'
          : '<td><i class="icon-time"></i> ' +
            (data[i + 1] / 1000).toFixed(2) +
            ' sec</td>';

      $leaderboard.append('<tr>' + col1 + col2 + col3 + '</tr>');
    }
  };

  $('.leaderboard-wrapper').each(function(index) {
    var $leaderboard = $(this).find('tbody');
    var $loading = $(this).find('.loading');
    var offset = 0;
    var type = index === 0 ? 'points' : 'times';

    $(this).scroll(function() {
      var diff = $(this).prop('scrollHeight') - $(this).scrollTop();

      if (diff === $(this).height() && offset < 180) {
        offset += 30;
        $loading.show();
        $.get('/sliceleaderboard', { begin: offset, by: type }, function(data) {
          $loading.hide();
          appendResults(data, $leaderboard, offset, type);
        });
      }
    });
  });
})();
