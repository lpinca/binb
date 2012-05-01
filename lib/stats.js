module.exports = function(db) {

	var collectStats = function(username, stats) {
		var key = "user:"+username;
		if (stats.points) {
			db.hincrby(key, "totpoints", stats.points);
		}
		if (stats.userscore) {
			// Set personal best
			db.hget(key, "bestscore", function(err, res) {
				if (res < stats.userscore) {
					db.hset(key, "bestscore", stats.userscore);
				}
			});
		}
		if (stats.gold) {
			db.hincrby(key, "golds", 1);
		}
		if (stats.silver) {
			db.hincrby(key, "silvers", 1);
		}
		if (stats.bronze) {
			db.hincrby(key, "bronzes", 1);
		}
		if (stats.guesstime) {
			db.hincrby(key, "guessed", 1);
			db.hincrby(key, "totguesstime", stats.guesstime);
			db.hget(key, "bestguesstime", function(err, res) {
				if (stats.guesstime < res) {
					db.hset(key, "bestguesstime", stats.guesstime);
				}
			});
			db.hget(key, "worstguesstime", function(err, res) {
				if (stats.guesstime > res) {
					db.hset(key, "worstguesstime", stats.guesstime);
				}
			});
		}
		if (stats.firstplace) {
			db.hincrby(key, "victories", 1);
		}
		if (stats.secondplace) {
			db.hincrby(key, "secondplaces", 1);
		}
		if (stats.thirdplace) {
			db.hincrby(key, "thirdplaces", 1);
		}
	};

	return collectStats;
};
