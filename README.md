![binb](http://dl.dropbox.com/u/58444696/binb-logo.png)

binb is a simple, realtime, multiplayer, competitive music listening game.

To play the game: [http://binb.nodejitsu.com](http://binb.nodejitsu.com)

## Installation

Unless previously installed you'll need the following packages:

- [Node.js](http://nodejs.org/)
- [Redis](http://redis.io/)
- [Cairo](http://cairographics.org/)

Please use their sites to get detailed installation instructions.

### Install binb

Once you have redis server up and running type:
    
    $ make install

Then run `$ npm start` or `$ node app.js` to start the app.

Point your browser to `http://127.0.0.1:8138` and have fun!

## Browser compatibiliy

Ideal setup is a browser with websocket support and able to decode .m4a format natively. 

For this reason binb is optimized for Google Chrome but also works in all major browsers.

## Shout-Outs

- Thanks to [beatquest.fm](http://beatquest.fm) for inspiration.
- Thanks to [nodejitsu](http://nodejitsu.com/) for application hosting.

## Bug tracker

Have a bug? Please create an [issue](https://github.com/lpinca/binb/issues) here on GitHub, with a description of the problem, browser and operating system information and how to reproduce the problem.

## Copyright and license

binb is released under the MIT license. See LICENSE for details.
