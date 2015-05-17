![binb](https://dl.dropbox.com/u/58444696/binb-logo.png)

binb is a simple, realtime, multiplayer, competitive music listening game.

To play the game: [https://binb.co](https://binb.co)

## Installation

Unless previously installed you'll need the following packages:

- [Node.js](http://nodejs.org/)
- [Redis](http://redis.io/)
- [Cairo](http://cairographics.org/)

Please use their sites to get detailed installation instructions.

You also need `UglifyJS` installed globally:

```shell
npm install uglify-js -g
```

### Install binb

Once you have redis server up and running type:

```shell
make install
```

Then run `npm start` or `node app.js` to start the app.

Point your browser to `http://127.0.0.1:8138` and have fun!

#### Possible errors

Some package managers name the Node.js binary `nodejs`. In this case you'll get
the following error:

```shell
/usr/bin/env: node: No such file or directory
```

To make it work you can create a symbolic link:

```shell
sudo ln -s /usr/bin/nodejs /usr/bin/node
```

and run `make install` again.

## Browser compatibiliy

binb requires a browser that supports the WebSocket protocol.

Refer to this [table](http://caniuse.com/websockets) for details on
compatibility.

## Shout-Outs

- Thanks to [beatquest.fm](http://beatquest.fm) for inspiration.

## Bug tracker

Have a bug? Please create an [issue](https://github.com/lpinca/binb/issues)
here on GitHub, with a description of the problem, how to reproduce it and in
what browser it occurred.

## Copyright and license

binb is released under the MIT license. See LICENSE for details.
