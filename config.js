/* The Base Configuration file */

exports.configure = function() {
	this.port = 80;
	this.songsdburl = '';
	this.usersdburl = '';
	this.sessionsecret = '';
	this.songsinarun = 15;
	this.fifolength = this.songsinarun * 3; // 3 is the number of games with no repeats of songs
	this.threshold = 2; // Edit distance threshold
	this.rooms = ["pop", "rock", "rap", "80s", "mixed"];
	return this;
};
