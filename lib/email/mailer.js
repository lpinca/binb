'use strict';

const fs = require('fs');
const pug = require('pug');
const { Resend } = require('resend');

const texttemplate = fs.readFileSync(__dirname + '/template.txt', 'utf-8');

/**
 * Generate the HTML version of the message.
 */

const HTMLMessage = pug.compileFile(__dirname + '/template.pug');

/**
 * Generate the plaintext version of the message.
 */

const plaintextMessage = function(token) {
  return texttemplate.replace(/<token>/, token);
};

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send the reset password email.
 */

exports.sendEmail = function(to, token, callback) {
  resend.emails
    .send({
      from: 'binb <no-reply@binb.co>',
      to: to,
      subject: 'binb password recovery',
      html: HTMLMessage({ token: token }),
      text: plaintextMessage(token)
    })
    .then(function({ error }) {
      callback(error);
    })
    .catch(callback);
};
