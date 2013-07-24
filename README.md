Lunacy
======


Copyright 2012-2013 [Sander Dijkhuis](mailto:mail@sanderdijkhuis.nl). The source code is available under an Apache 2.0 license.

The artwork used in Lunacy is not available under an open source or free software license. You can download [dl.playlunacy.com/visuals.zip](http://dl.playlunacy.com/visuals.zip) and extract it to the `visuals/` directory for testing.


Developing the gameplay
-----------------------

1. Start a web server that hosts the Lunacy folder, for example using [Mongoose](https://code.google.com/p/mongoose/) in Windows.
2. Go to the test page using Chrome. The URL is [localhost:8080/html/index.inmem.html](http://localhost:8080/html/index.inmem.html) if you use Mongoose.


Installing the extension
------------------------

1. In Chrome, visit [chrome://extensions](chrome://extensions).
2. Make sure **Developer mode** is enabled in the upper right corner.
3. Click the **Load unpacked extension…** button.
4. Select the **lunacy** folder that you have synced using GitHub or git.

You can now launch the new Lunacy in the same way as you launch the old Lunacy. Note that they have the same icon.

To load updated code, press ctrl+R (or any other key combination you use for reloading) while Lunacy is running.


Making a new Chrome release
---------------------------

1. Update the version number in `manifest.json`.
2. Run `v=VERSION tools/release.sh`, where VERSION is the same number as in `manifest.json`.
3. Upload `dist/VERSION.zip` to the Chrome Web Store.


Game data schema
----------------

Games are split up into multiple CouchDB documents, that are selectively synched to user databases.

![See schema.png.](schema.png?raw=true)


File structure
--------------

    - html/                        client-side files
      - images/                    redistributable images
      - js/                        JavaScript scripts, including standard Angular scripts
      - less/                      style sheets
      - lib/                       third-party font and libraries
      - partials/                  HTML templates, among which:
        - game-main.html           in-game main views
        - game-event.html          game history notices
      - index.inmem.html           test without a database connection
      - index.nocache.deploy.html  used in Chrome app
    - lib/                         code shared between server and clients
      - game.js                    game objects and functions
      - proceed.js                 game logic

    - visuals/                     non-redistributable visuals used in the game
                                 
    - config/                      configuration files, symlink one to config.js
    - manifest.json                Chrome Web App settings
                                 
    - design/                      CouchDB design documents with map/reduce queries etc.
      - general.js                 used in multiple places
      - server.js                  only used by e.g. gamemaster
      - user.js                    only used by clients
                                 
    - bots/
      - bouncer.js                 handles user presence and data transfer
      - collector.*                collects money from Google for upgrading accounts
      - gamemaster.js              creates open games and proceeds them
      - hedwig.js                  delivers messages to users
      - host.js                    creates new user accounts
                                 
    - chrome/                      Chrome packaged app
    - ios/                         iOS app
     
    - tools/                       tools for development
      - actions.js                 create an overview of players who need to do something
      - less.sh                    compile style sheets for iOS
      - push.sh                    push to db, usage: server=name:passwd@server tools/push.sh
      - random.js                  take all open actions and perform them randomly
      - release.sh                 build Chrome app, usage: v=2.0.0 tools/release.sh
      - replicate_from_users.js    used in case bouncer doesn’t work properly
    
    - node_modules/                imported libraries for the server
                                 
    - README.md                    this file


Third-party material distributed with app
-----------------------------------------

- [AngularJS](http://angularjs.org/) (MIT license)
- [angular-mobile-nav](https://github.com/ajoslin/angular-mobile-nav) (MIT license)
- [Bootstrap](http://twitter.github.com/bootstrap/) (Apache 2.0 license)
- [Fondamento](http://www.google.com/fonts/specimen/Fondamento) (OFL 1.1 license)
- [jQuery](http://jquery.com/) (MIT license)
- [LESS](http://lesscss.org/) (Apache 2.0 license)
- [node-uuid](https://github.com/broofa/node-uuid) (MIT license)
