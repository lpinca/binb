/**
 * Module dependencies.
 */

var canvas = require('canvas')
    , characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Expose the constructor.
 */

module.exports = function() {
    var code = ''
        , _canvas = new canvas(64, 26)
        , ctx = _canvas.getContext('2d');

    while (code.length < 4) {
        code += characters[Math.floor(Math.random() * characters.length)];
    }

    ctx.fillStyle = '#DDDDDD';
    ctx.fillRect(0, 0, 64, 26);
    ctx.font = 'bold 20px Helvetica';
    ctx.lineWidth = 1;
    ctx.textAlign = "center";
    ctx.strokeStyle = '#080';
    ctx.strokeText(code, 31, 20);
    ctx.save();

    this.getCode = function() {
        return code;
    };

    this.toDataURL = function() {
        return _canvas.toDataURL();
    };
};
