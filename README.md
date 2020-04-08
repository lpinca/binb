![binb](https://raw.githubusercontent.com/lpinca/binb/master/public/img/binb-logo.png)

binb is a simple, realtime, multiplayer, competitive music listening game.

To play the game: [https://binb.co](https://binb.co)

## Installation

Unless previously installed you'll need the following packages:

- [Node.js](http://nodejs.org/)
- [Redis](http://redis.io/)
- [Cairo](http://cairographics.org/)

Please use their sites to get detailed installation instructions.

If you don't want to install anything (and have the docker engine), you can also fast forward and use the following two commands

```
docker-compose build
docker-compose up
```

### Install binb

The first step is to install the dependencies:

```shell
npm install
```

Then you need to minify the assets:

```shell
npm run minify
```

Now make sure that the Redis server is running and load some sample tracks:

```shell
npm run import-data
```

Finally run `npm start` or `node app.js` to start the app.

Point your browser to `http://127.0.0.1:8138` and have fun!

#### Possible errors

Some package managers name the Node.js binary `nodejs`. In this case you'll get
the following error:

```shell
sh: node: command not found
```

To fix this issue, you can create a symbolic link:

```shell
sudo ln -s /usr/bin/nodejs /usr/bin/node
```

and try again.

## Browser compatibiliy

binb requires a browser that supports the WebSocket protocol.

Refer to this [table](http://caniuse.com/websockets) for details on
compatibility.

## Shout out to

- [beatquest.fm](http://beatquest.fm) for inspiration.

## Bug tracker

Have a bug? Please create an [issue](https://github.com/lpinca/binb/issues) here
on GitHub, with a description of the problem, how to reproduce it and in what
browser it occurred.

## Copyright and license

binb is released under the MIT license. See [LICENSE](LICENSE) for details.
