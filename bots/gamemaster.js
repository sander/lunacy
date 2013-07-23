#!/usr/bin/env node

// Copyright 2012-2013 Sander Dijkhuis
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


// Game Master masters games.

var events = require('events');
var http = require('http');
var follow = require('follow');
var request = require('request');

var config = require('../config/config');
var Game = require('../lib/game');
var Proceed = require('../lib/proceed');
var RandomPlayer = require('../html/js/bots');

var db = config.couch + '/' + config.db;

function normalize(name) {
  // Only lowercase letters and numbers.
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

var listeners = [];
var listen = function(res) {
  listeners.push(res);
};
var unlisten = function(res) {
  listeners.splice(listeners.indexOf(res));
};

function init() {
  getSeq();
  checkOpen();
  handlePast();
}

function handlePast() {
  request.get({ url: db + '/_design/server/_view/games', json: true }, function(err, res, body) {
    if (body && body.rows) body.rows.forEach(function(row) {
      process(row.value.id);
    });
  });
}

function getSeq() {
  request.get({ url: db, json: true }, function(error, res, body) {
    waitForChange(body.update_seq);
  });
}
function waitForChange(since) {
  follow({
    db: db,
    since: since,
    include_docs: true
  }, onChange);
}
function onChange(error, change) {
  if (change.doc.game_id && change.doc.type != 'game_chat' && !handling(change.doc.game_id))
    process(change.doc.game_id);
}

var _handling = [];
function handle(id) {
  _handling.push(id);
}
function handled(id) {
  _handling.splice(_handling.indexOf(id), 1);
}
function handling(id) {
  return _handling.indexOf(id) != -1;
}

function process(id) {
  handle(id);
  request.get({ url: db + '/_design/server/_view/game_info?include_docs=true&key=' + encodeURIComponent('"' + id + '"'), json: true }, function(err, res, body) {
    if (err || !body.rows || !body.rows.length) return console.log('not found', err, id);
    var docs = [];
    body.rows.forEach(function(row) {
      docs.push(row.doc);
    });
    var game = new Game(docs);
    consider(game);
  });
}

function consider(game) {
  if (game.shared.open) {
    if (!game.shared.n_vacancies) {
      game.shared.open = false;
      request.put({ url: db + '/' + game.shared._id, json: true, body: JSON.stringify(game.shared) }, function(err, res, body) {
        handled(game.id);
        checkOpen();
      });
    } else {
      announce();
      handled(game.id);
    }
  } else if (game.ended) {
    console.log('\tended', game.id);
    handled(game.id);
  } else if (game.ready) {
    console.log('\tready', game.id);
    Proceed.call(game);
    request.post({ url: db + '/_bulk_docs', json: { docs: game.docs } }, function(err, res, body) {
      console.log('proceeded', game.id);
      handled(game.id);
    });
  } else {
    var docs = [];
    game.action.forEach(function(action) {
      if (!action.ready && action.user.split(' ')[0] == 'Bot') {    
        new RandomPlayer(game, action.user).perform(action);
        docs.push(action.toJSON());
      }
    });
    if (docs.length) {
      request.post({ url: db + '/_bulk_docs', json: { docs: docs } }, function(err, res, body) {
        console.log('botted', game.id);
        handled(game.id);
      });
    } else handled(game.id);
  }
}

function checkOpen() {
  request.get({ url: db + '/_design/server/_view/open_games?include_docs=true', json: true }, function(err, res, body) {
    if (body.rows.length == 0) createOpen();
    else announce();
  });
}
function createOpen() {
  request.get({ url: config.couch + '/_uuids', json: true }, function(err, res, body) {
    var game = Game.create(body.uuids[0], {
      name: Game.names[Math.floor(Math.random() * Game.names.length)],
      players: [],
      open: true,
      n_players: 5,
      n_werewolves: 1
    });
    request.post({ url: db + '/_bulk_docs', json: { docs: game.docs } }, function(err, res, body) {
      console.log('created open game');
      process(game.id);
      announce();
    });
  });
}

function join(id, user, cb) {
  console.log('joining', user, id);
  request.get({ url: db + '/_design/general/_view/allowed_to_start?key=' + encodeURIComponent(JSON.stringify(user)), json: true }, function(err, res, body) {
    if (body.rows && body.rows.length)
      var allowed = body.rows[0].value;
    else
      var allowed = 1;
    if (allowed < 1) {
      console.log('need to upgrade', user);
      return cb('too many games', null);
    }
    request.get({ url: db + '/_design/server/_view/game_info?include_docs=true&key=' + encodeURIComponent('"' + id + '"'), json: true }, function(err, res, body) {
      if (err || !body.rows || !body.rows.length) return cb('not found', null);
      var docs = [];
      body.rows.forEach(function(row) {
        if (['game_shared_data', 'game_hidden_data'].indexOf(row.doc.type) != -1)
          docs.push(row.doc);
      });
      var game = new Game(docs);
      if (!game.shared.open) return cb('not open', null);
      if (game.players.array.indexOf(user) > -1) return cb('already joined', null);
      game.addPlayer(user, true);
      
      var dbname = config.db + '/user/' + normalize(user);

      console.log('replicating to', dbname);
      request.post({ url: db + '/_bulk_docs', json: { docs: game.docs } }, function(err, res, body) {
        request.post({ url: config.couch + '/_replicate', json: {
          source: 'lunacy',
          target: dbname,
          filter: 'server/to_user',
          query_params: {
            user: user,
          }
        }}, function(err, res, body) {
          cb(null, 'added');
          console.log('joined', user, id);
        });
      });
    });
  });
}

var open = [];
function announce() {
  request.get({ url: db + '/_design/server/_view/games', json: true }, function(err, res, body) {
    open = [];
    if (body && body.rows) body.rows.forEach(function(row) {
      if (row.value.open) open.push(row.value);
    });
    listeners.forEach(function(res) {
      res.write('data: ' + JSON.stringify(open) + '\n\n');
    });
  });
}
http.createServer(function(req, res) {
  if (req.headers.accept && req.headers.accept == 'text/event-stream') {
    if (req.url == '/open') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': config.clientOrigin,
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Credentials': true,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      listen(res);
      res.write('data: ' + JSON.stringify(open) + '\n\n');
      res.on('close', function() {
        unlisten(res);
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  } else if (req.method == 'POST' && req.url == '/join') {
    var data = '';
    req.on('data', function(chunk) { data += chunk; });
    req.on('end', function() {
      var params = JSON.parse(data);
      join(params.id, params.user, function(error, success) {
        if (error) {
          res.writeHead(404);
          res.end(error);
        } else {
          res.writeHead(200, {
            'Access-Control-Allow-Origin': config.clientOrigin,
            'Access-Control-Allow-Methods': 'POST, GET',
            'Access-Control-Allow-Credentials': true
          });
          res.end(success);
        }
      });
    });
  } else if (req.method == 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': config.clientOrigin,
      'Access-Control-Allow-Methods': 'POST, GET',
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(config.ports.gamemaster, '0.0.0.0');

init();
