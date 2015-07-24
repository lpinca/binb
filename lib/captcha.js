'use strict';

/**
 * Module dependencies.
 */

var canvas = require('canvas')
  , characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Captcha constructor.
 */

function Captcha() {
  this.code = '';
  this.canvas = new canvas(64, 26);
  this.initialize();
}

/**
 * Generate the captcha.
 */

Captcha.prototype.initialize = function() {
  while (this.code.length < 4) {
    this.code += characters[Math.floor(Math.random() * characters.length)];
  }

  var ctx = this.canvas.getContext('2d');

  ctx.fillStyle = '#DDDDDD';
  ctx.fillRect(0, 0, 64, 26);
  ctx.font = 'bold 20px Helvetica';
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#080';
  ctx.strokeText(this.code, 31, 20);
  ctx.save();
};

/**
 * Return the captcha code.
 */

Captcha.prototype.getCode = function() {
  return this.code;
};

/**
 * Return the captcha image.
 */

Captcha.prototype.toDataURL = function() {
  return this.canvas.toDataURL();
};

/**
 * Expose the constructor.
 */

module.exports = Captcha;
