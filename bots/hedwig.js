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


/*
 * TODO auth using cookies, check with couchdb
 */

var events = require('events');
var follow = require('follow');
var fs = require('fs');
var http = require('http');
var querystring = require('querystring');
var request = require('request');

var config = require('../config/config');
var Game = require('../lib/game');

var db = config.couch + '/' + config.db;

var emitter;
var actionCount = {};
var sent = {};

function init() {
  emitter = new events.EventEmitter();
  getSeq(waitForChange);
  getActions();
  http.createServer(function(req, res) {
    initSource(req, res);
  }).listen(config.ports.hedwig, '0.0.0.0');
}

function getActions(auser) {
  request.get({
    url: db + '/_design/general/_view/games?group=true',
    json: true
  }, function(error, res, body) {
    actionCount = {};
    body.rows.forEach(function(row) {
      if (!row.value) return;
      row.value.action_needed.forEach(function(user) {
        if (!actionCount[user]) actionCount[user] = 0;
        actionCount[user]++;
      });
    });
    if (auser) emit(auser);
    else for (var user in actionCount) emit(user);
  });
}
function decrease(user) {
  if (actionCount[user])
    actionCount[user]--;
}
function emit(user) {
  sent[user] = -1;
  if (actionCount[user] > sent[user]) {
    emitter.emit(user, { type: 'turn', number: actionCount[user] });
    sent[user] = actionCount[user];
  }
}

function initSource(req, res) {
  var user = decodeURI(req.url.substr(1));

  console.log('open\t' + user);
  res.writeHead(200, {
    'Access-Control-Allow-Origin': config.clientOrigin,
    'Access-Control-Allow-Methods': 'POST, GET',
    'Access-Control-Allow-Credentials': true,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.connection.setTimeout(60 * 60 * 1000); // 1 hour timeout

  var listener = function(event) {
    console.log('event\t' + user + '\t' + event.type);
    if (event.type == 'game_chat') res.write('event: chat\ndata: ' + JSON.stringify(event) + '\n\n');
    else if (event.type == 'turn') res.write('event: turn\ndata: ' + JSON.stringify(event) + '\n\n');
  };
  emitter.on(user, listener);
  
  if (actionCount[user]) emit(user);
  
  req.on('close', function() {
    console.log('close\t' + user);
    emitter.removeListener(user, listener);
  });
}

function getSeq(cb) {
  request.get({ url: db, json: true }, function(error, res, body) {
    cb(body.update_seq);
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
  if (change.doc.type == 'game_chat')
    processChat(change.doc);
  else if (change.doc.type == 'game_action' && (change.deleted || new Game.Action(change.doc).ready))
    return;
    //decrease(change.doc.user);
  else if (change.doc.type == 'game_action')
    getActions(change.doc.user);
}
function processChat(doc) {
  request.get({ url: db + '/_design/server/_view/game_info?include_docs=true&key=' + encodeURIComponent('"' + doc.game_id + '"'), json: true }, function(err, res, body) {
    if (err || !body.rows || !body.rows.length) return cb('not found', null);
    var docs = [];
    body.rows.forEach(function(row) {
      docs.push(row.doc);
    });
    var game = new Game(docs);
    game.players.forEach(function(player) {
      emitter.emit(player, {
        type: 'game_chat',
        user: doc.user,
        game: {
          id: game.id,
          name: game.shared.name
        },
        content: doc.content
      });
    });
  });
}

init();
