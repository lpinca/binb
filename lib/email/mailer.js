'use strict';

/**
 * Module dependencies.
 */

var fs = require('fs')
  , jade = require('jade')
  , nodemailer = require('nodemailer')
  , texttemplate = fs.readFileSync(__dirname + '/template.txt', 'utf-8');

/**
 * Generate the HTML version of the message.
 */

var HTMLMessage = jade.compileFile(__dirname + '/template.jade');

/**
 * Generate the plaintext version of the message.
 */

var plaintextMessage = function(token) {
  return texttemplate.replace(/<token>/, token);
};

/**
 * Create a reusable transport method.
 */

var transport = nodemailer.createTransport({
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
  transport.sendMail({
    from: 'binb <no-reply@binb.co>',
    to: to,
    subject: 'binb password recovery',
    html: HTMLMessage({ token: token }),
    text: plaintextMessage(token)
  }, function(err, info) {
    if (err) {
      return callback(err);
    }

    callback(null, info);
  });
};
