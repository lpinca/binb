/* The Base Configuration file */

exports.configure = function() {
	this.port = 80;
	this.redisurl = '';
	this.songsinarun = 15;
	this.threshold = 2; // Edit distance threshold
	this.rooms = ["pop", "rock", "mixed"];
	return this;
};
