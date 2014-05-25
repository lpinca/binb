![binb](http://dl.dropbox.com/u/58444696/binb-logo.png)

binb is a simple, realtime, multiplayer, competitive music listening game.

To play the game: [http://binb.nodejitsu.com](http://binb.nodejitsu.com)

## Installation

Unless previously installed you'll need the following packages:

- [Node.js](http://nodejs.org/)
- [Redis](http://redis.io/)
- [Cairo](http://cairographics.org/)

Please use their sites to get detailed installation instructions.

You also need `UglifyJS` installed globally:

    $ npm install uglify-js -g

### Install binb

Once you have redis server up and running type:

    $ make install

Then run `$ npm start` or `$ node app.js` to start the app.

Point your browser to `http://127.0.0.1:8138` and have fun!

## Browser compatibiliy

binb requires a browser that supports the WebSocket protocol.

Refer to this [table](http://caniuse.com/websockets) for details on compatibility.

## Shout-Outs

- Thanks to [beatquest.fm](http://beatquest.fm) for inspiration.
- Thanks to [nodejitsu](http://nodejitsu.com/) for hosting the application.

## Bug tracker

Have a bug? Please create an [issue](https://github.com/lpinca/binb/issues) here on GitHub, with a description of the problem, how to reproduce it and in what browser it occurred.

## Copyright and license

binb is released under the MIT license. See LICENSE for details.
