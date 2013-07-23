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
var follow = require('follow');
var fs = require('fs');
var http = require('http');
var querystring = require('querystring');
var request = require('request');

var config = require('../config/config');
var Game = require('../lib/game');

var db = config.couch + '/' + config.db;

request.get({
  url: db + '/_design/general/_view/games?group=true',
  json: true
}, function(error, res, body) {
  var actions = {};
  body.rows.forEach(function(row) {
    if (!row.value || row.value.ended) return;
    row.value.action_needed.forEach(function(user) {
      if (!actions[user]) actions[user] = [];
      actions[user].push([row.value.name, row.key]);
    });
    row.value.open_actions.forEach(function(action) {
      console.log(action);
    });
  });
  for (var user in actions) console.log(user, actions[user]);
});
