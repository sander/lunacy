#!/usr/bin/env node --use-strict --harmony

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

// TODO Bouncer could also start creating user databases on-demand, and remove them after a too long absence.

const Bouncer = function() {
  this.connections = {};
};

Bouncer.prototype.serve = function() {
  request.get({ url: db, json: true }, function(error, res, body) {
    follow({
      db: db,
      since: body.update_seq,
      include_docs: true
    }, onChange.bind(this));
  }.bind(this));
  
  http.createServer(handle.bind(this)).listen(config.ports.bouncer, '0.0.0.0');
  console.log('started Bouncer on port', config.ports.bouncer);
};

const handle = function(req, res) {
  let args = req.url.substr(1).split('/');
  if (args.length != 2) {
    if (['/favicon.ico', '/robots.txt'].indexOf(req.url) == -1) {
      console.log('refused', req.url);
    }
    res.writeHead(400);
    res.end();
    return;
  }
  let type = args[0];
  let user = decodeURIComponent(args[1]);
  // TODO do actual auth
  
  if (type in handlers) handlers[type].bind(this)(user, req, res);
  else {
    res.writeHead(404);
    res.end();
  }
};

const handlers = {};
handlers.presence = function(user, req, res) {
  console.log('welcoming', user);
  res.writeHead(200, {
    'Access-Control-Allow-Origin': config.clientOrigin,
    'Access-Control-Allow-Methods': 'POST, GET',
    'Access-Control-Allow-Credentials': true,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (!res.connection) return;
  res.connection.setTimeout(60 * 60 * 1000); // 1 hour timeout
  
  if (!(user in this.connections)) {
    this.connections[user] = new UserConnection(user);
  } else {
    this.connections[user].references++;
  }
  
  req.on('close', function() {
    console.log('goodbye %s', user);
    var references = --this.connections[user].references;
    if (!references) {
      delete this.connections[user];
    }
  }.bind(this));
};
handlers.push = function(user, req, res) {
  console.log('got a push from', user);
  res.writeHead(200, {
    'Access-Control-Allow-Origin': config.clientOrigin,
    'Access-Control-Allow-Methods': 'POST, GET',
    'Access-Control-Allow-Credentials': true
  });
  res.end();

  request.post({ url: config.couch + '/_replicate', json: {
    source: 'lunacy/user/' + normalize(user),
    target: 'lunacy'
  }}, function(error, res, body) {
    let written = body.history.map(function(e) { return e.docs_written; }).reduce(function(n, m) { return n + m; }, 0);
    console.log('replicated %d docs from %s', written, user);
  }.bind(this));
};

const onChange = function(error, change) {
  let doc = change.doc;
  for (let user in this.connections) {
    let conn = this.connections[user];
    if (conn.ready) {
      if (toUserFilter(doc, user) || (doc.type == 'profile' && conn.contacts.indexOf(doc.user) != -1)) {
        conn.to.push(doc._id);
      }
      if (doc.type == 'friendship' && doc.user == user) {
        if (conn.contacts.indexOf(doc.friend) == -1) conn.addContact(doc.friend);
      } else if (doc.type == 'game_shared_data' && doc.about[user]) {
        let players = Object.keys(doc.about);
        players.forEach(function(player) {
          if (player != user && conn.contacts.indexOf(player) == -1) {
            conn.addContact(player);
          }
        }.bind(this));
      }
    }
  }
};

const toUserFilter = function(doc, user) {
  if (doc._id == '_design/user' || doc._id == '_design/general') return true;
  if (doc.type == 'profile') return true;
  if (doc.user == user) return true;
  if (doc.access && (typeof doc.access.indexOf) === 'function' && doc.access.indexOf(user) != -1) return true;
  return false;
};

const normalize = function(name) {
  // Only lowercase letters and numbers.
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const UserConnection = function(user) {
  this.user = user;
  this.to = async.cargo(this.replicateToUser.bind(this));
  this.references = 1;
  this.ready = false;
  this.contacts;
  
  let startkey = encodeURIComponent(JSON.stringify([user]));
  let endkey = encodeURIComponent(JSON.stringify([user, {}]));
  request.get({ url: db + '/_design/server/_view/connections?group=true&startkey=' + startkey + '&endkey=' + endkey, json: true }, function(err, res, body) {
    this.contacts = body.rows.map(function(row) {
      return row.key[1];
    });
    request.get({ url: db + '/_design/server/_view/profiles?keys=' + encodeURIComponent(JSON.stringify(this.contacts)), json: true }, function(err, res, body) {
      let profiles = body.rows.map(function(row) {
        return row.id;
      });
      request.post({ url: config.couch + '/_replicate', json: {
        source: 'lunacy',
        target: 'lunacy/user/' + normalize(this.user),
        filter: 'server/to_user',
        query_params: {
          user: user,
          profiles: JSON.stringify(profiles)
        }
      }}, function(error, res, body) {
        let written = body.history.map(function(e) { return e.docs_written; }).reduce(function(n, m) { return n + m; }, 0);
        console.log('%s is ready after getting %d docs (tried %d profiles)', user, written, profiles.length);
        this.ready = true;
      }.bind(this));
    }.bind(this));
  }.bind(this));
};

UserConnection.prototype.replicateToUser = function(ids, callback) {
  request.post({ url: config.couch + '/_replicate', json: {
    source: 'lunacy',
    target: 'lunacy/user/' + normalize(this.user),
    doc_ids: ids
  }}, function(error, res, body) {
    let written = body.history.map(function(e) { return e.docs_written; }).reduce(function(n, m) { return n + m; }, 0);
    console.log('replicated %d/%d docs to %s', written, ids.length, this.user);
    callback();
  }.bind(this));
};

UserConnection.prototype.addContact = function(friend) {
  request.get({ url: db + '/_design/server/_view/profiles?key=' + encodeURIComponent(JSON.stringify(friend)), json: true }, function(err, res, body) {
    if (body.rows.length) {
      console.log('adding contact %s to %s', friend, this.user);
      this.contacts.push(friend);
      let id = body.rows[0].id;
      this.to.push(id);
    } else {
      console.log('failed to find profile of %s’s friend %s', this.user, friend);
    };
  }.bind(this));
};

if (require.main == module) {
  let b = new Bouncer;
  b.serve();
}
