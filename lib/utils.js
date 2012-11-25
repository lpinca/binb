/**
 * Helper function used to build leaderboards.
 * Rearrange database results in an object.
 */

exports.buildLeaderboards = function(pointsresults, timesresults) {
    var obj = {
        pointsleaderboard: [],
        timesleaderboard: []
    };
    for (var i=0; i<pointsresults.length; i+=2) {
        obj.pointsleaderboard.push({
            username: pointsresults[i],
            totpoints: pointsresults[i+1]
        });
        obj.timesleaderboard.push({
            username: timesresults[i],
            bestguesstime: (timesresults[i+1] / 1000).toFixed(2)
        });
    }
    return obj;
};

/**
 * Check if the provided string is a valid email address.
 */

exports.isEmail = function(str) {
    // Simple filter, but it covers most of the use cases.
    var filter = /^[+a-zA-Z0-9_.\-]+@([a-zA-Z0-9\-]+\.)+[a-zA-Z0-9]{2,6}$/;
    return filter.test(str);
};

/**
 * Get a random slogan.
 */

exports.randomSlogan = function() {
	var slogans = [
        'guess the song.'
        , 'name that tune.'
        , 'i know this track.'
    ];
	return slogans[Math.floor(Math.random() * slogans.length)];
};

/**
 * Return the sorting parameters used to get users ordered by best guess time.
 */

exports.sortParams = function(offset) {
    var params = [
        'users'
        , 'by'
        , 'user:*->bestguesstime'
        , 'get'
        , '#'
        , 'get'
        , 'user:*->bestguesstime'
        , 'limit'
        , offset
        , '30'
    ];
    return params;
};
