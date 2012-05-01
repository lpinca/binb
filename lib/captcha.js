var canvas = require("canvas");

module.exports = function(characters) {

	function Captcha() {
		var code = "";
		while (code.length < 4) {
			code += characters[Math.floor(Math.random() * characters.length)];
		}
		var _canvas = new canvas(64, 26);
		var ctx = _canvas.getContext('2d');
		ctx.fillStyle = "#DDDDDD";
		ctx.fillRect(0, 0, 64, 26);
		ctx.font = "bold 20px Helvetica";
		ctx.lineWidth = 1;
		ctx.textAlign = "center";
		ctx.strokeStyle = "#080";
		ctx.strokeText(code, 31, 20);
		ctx.save();
		this.getCode = function() {
			return code;
		};
		this.toDataURL = function() {
			return _canvas.toDataURL();
		};
	}

	return Captcha;
};
