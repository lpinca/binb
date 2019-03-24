'use strict';

const fs = require('fs');
const pug = require('pug');
const nodemailer = require('nodemailer');
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

/**
 * Create a reusable transport method.
 */

const transport = nodemailer.createTransport({
  service: 'SendGrid',
  auth: {
    user: process.env.SENDGRID_USER,
    pass: process.env.SENDGRID_PASS
  }
});

/**
 * Send the reset password email.
 */

exports.sendEmail = function(to, token, callback) {
  transport.sendMail(
    {
      from: 'binb <no-reply@binb.co>',
      to: to,
      subject: 'binb password recovery',
      html: HTMLMessage({ token: token }),
      text: plaintextMessage(token)
    },
    function(err, info) {
      if (err) {
        return callback(err);
      }

      callback(null, info);
    }
  );
};
