Lunacy
======


Copyright 2012-2013 [Sander Dijkhuis](mailto:mail@sanderdijkhuis.nl). The source code is available under an Apache 2.0 license. The artwork used in Lunacy is not available under an open source or free software license.


Developing the gameplay
-----------------------

1. Start a web server. In Windows, you could do this by starting a copy of mongoose.exe from the Lunacy folder.
2. Go to the test page using Chrome. The URL is [localhost:8080/html/index.inmem.html](http://localhost:8080/html/index.inmem.html) if you use Mongoose.


Installing the extension
------------------------

1. In Chrome, visit [chrome://extensions](chrome://extensions).
2. Make sure **Developer mode** is enabled in the upper right corner.
3. Click the **Load unpacked extension…** button.
4. Select the **lunacy** folder that you have synced using GitHub or git.

You can now launch the new Lunacy in the same way as you launch the old Lunacy. Note that they have the same icon.

To load updated code, press ctrl+R (or any other key combination you use for reloading) while Lunacy is running.


File structure
--------------

    - html/                        client-side files
      - images/                    backgrounds, illustrations, roles, default avatar
      - js/                        JavaScript scripts, including standard Angular scripts and:
        - bots.js                  bots used for testing
      - less/                      style sheets
      - lib/                       third-party libraries
      - partials/                  HTML templates, among which:
        - game-main.html           in-game main views
        - game-chat.html           chat and game history
      - index.inmem.html           test without a database connection
      - index.nocache.deploy.html  used in Chrome app
      - index.nocache.dev.html     test with a local database
    - images/                      general images
    - lib/                         code shared between server and clients
      - game.js                    game objects and functions
      - proceed.js                 game logic
                                 
    - config/                      configuration files, symlink one of both to config.js
    - manifest.json                Chrome Web App settings
                                 
    - design/                      CouchDB design documents with map/reduce queries etc.
      - general.js                 used in multiple places
      - server.js                  only used by e.g. gamemaster
      - user.js                    only used by clients
                                 
    - bots/
      - bouncer.js                 handles user presence and data transfer
      - collector.*                collects money from Google for upgrading accounts
      - gamemaster.html            creates open games and proceeds them
      - hedwig.js                  delivers messages to users
      - host.js                    creates new user accounts
                                 
    - chrome/                      Chrome app
    - ios/                         iOS app
     
    - tools/                       tools for development
      - push.sh                    push to db, usage: server=name:passwd@server tools/push.sh
      - release.sh                 create zip, usage: v=2.0.0 tools/release.sh
    
    - node_modules/                imported libraries for the server
                                 
    - README.md                    this file


Imported libraries
------------------

- [AngularJS](http://angularjs.org/)
- [Bootstrap](http://twitter.github.com/bootstrap/)
- [jQuery](http://jquery.com/)
- [node-uuid](https://github.com/broofa/node-uuid)
- [LESS](http://lesscss.org/)
