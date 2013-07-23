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


const async = require('async');
const events = require('events');
const follow = require('follow');
const fs = require('fs');
const http = require('http');
const querystring = require('querystring');
const request = require('request');

const config = require('../config/config');
const Game = require('../lib/game');

const db = config.couch + '/' + config.db;

var q = [];

var normalize = function(name) {
  // Only lowercase letters and numbers.
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

var handle = function() {
  if (q.length) {
    var user = q.pop();

    request.post({ url: config.couch + '/_replicate', json: {
      source: 'lunacy/user/' + normalize(user),
      target: 'lunacy'
    }}, function(error, res, body) {
      var written = body.history.map(function(e) { return e.docs_written; }).reduce(function(n, m) { return n + m; }, 0);
      console.log('replicated %d docs from %s', written, user);
      handle();
    }.bind(this));
  }
};

request.get({ url: config.couch + '/_users/_all_docs', json: true }, function(error, res, body) {
  body.rows.forEach(function(row) {
    if (row.id == '_design/_auth' || row.id == 'org.couchdb.user:sander' || row.id == 'org.couchdb.user:host') return;
    var user = row.id.split(':')[1];

    q.push(user);
  });

  handle();
});
