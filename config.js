/* The Base Configuration file */

exports.configure = function() {
	this.port = 80;
	this.redisurl = '';
	this.songsinarun = 15;
    return this;
};
