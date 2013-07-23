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


var events = require('events');
var http = require('http');
var follow = require('follow');
var request = require('request');

var config = require('../config/config');
var Game = require('../lib/game');
var Proceed = require('../lib/proceed');
var RandomPlayer = require('../html/js/bots');

var db = config.couch + '/' + config.db;

request.get({ url: db + '/_design/server/_view/games', json: true }, function(err, res, body) {
  if (body && body.rows) body.rows.forEach(function(row) {
    process(row.value.id);
  });
});

function process(id) {
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
  if (game.ready) return;
  var docs = [];
  game.action.forEach(function(action) {
    if (!action.ready) {    
      new RandomPlayer(game, action.user).perform(action);
      docs.push(action.toJSON());
    }
  });
  if (docs.length) {
    //console.log('posting', docs.length, 'docs');
    request.post({ url: db + '/_bulk_docs', json: { docs: docs } }, function(err, res, body) {
      console.log('botted', game.id);
    });
  }
}
