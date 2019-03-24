'use strict';

const { createCanvas } = require('canvas');

const characters =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Captcha constructor.
 */

function Captcha() {
  this.code = '';
  this.canvas = createCanvas(74, 26);
  this.initialize();
}

/**
 * Generate the captcha.
 */

Captcha.prototype.initialize = function() {
  while (this.code.length < 4) {
    this.code += characters[Math.floor(Math.random() * characters.length)];
  }

  const ctx = this.canvas.getContext('2d');

  ctx.fillStyle = '#DDDDDD';
  ctx.fillRect(0, 0, 74, 26);
  ctx.font = '20px DroidSans';
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#080';
  ctx.fillText(this.code, 36, 20);
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
