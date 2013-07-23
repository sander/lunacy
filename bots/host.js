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


var http = require('http');
var follow = require('follow');
var request = require('request');
var util = require('util');

var config = require('../config/config');

function respond(response, code, json) {
  var headers = {
    'Access-Control-Allow-Origin': config.clientOrigin,
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Headers': 'X-Requested-With, Access-Control-Allow-Origin, X-HTTP-Method-Override, Content-Type, Authorization, Accept'
  };
  if (json) headers['Content-Type'] = 'application/json';
  response.writeHead(code, headers);
  if (json)
    response.end(JSON.stringify(json, null, 2) + '\n');
  else
    response.end();
  if (json && json.error) console.log('error:', json.error);
};

function normalize(name) {
  // Only lowercase letters and numbers.
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

http.createServer(function(req, res) {
  if (req.method == 'OPTIONS') return respond(res, 200);
  if (req.method != 'POST') return respond(res, 405, { error: 'method not allowed' });
  if (req.url != '/register') return respond(res, 404, { error: 'not found' });

  var data = '';
  req.on('data', function(chunk) { data += chunk; });
  req.on('end', function() {
    handle(req, res, JSON.parse(data));
  });
}).listen(config.ports.host, '0.0.0.0');

function handle(req, res, form) {
  // Data check
  if (!form.name) return respond(res, 400, { error: 'no name entered' });
  if (!form.password) return respond(res, 400, { error: 'no password entered' });

  // Username check
  var name = form.name;
  var normalized = normalize(name);
  var db = config.couch + '/' + config.db + '%2Fuser%2F' + normalized;
  if (name.length > config.maxNameLength) respond(res, 400, { error: 'too long name' });
  
  var createAccount = function(error, cres, body) {
    if (cres.statusCode == 200) return respond(res, 409, { error: 'name already taken' });
    
    console.log(new Date().toJSON(), 'trying to register', name);
      
    // Create user account
    request.put({
      url: config.couch + '/_users/org.couchdb.user:' + name,
      json: {
        type: 'user',
        name: name,
        password: form.password,
        roles: []
      }
    }, createDatabase);
  };
  
  request.get(db, createAccount);
  
  var createDatabase = function(error, cres, body) {
    if (cres.statusCode != 201) return respond(res, cres.statusCode, body);

    // Create database
    request.put(db, setSecurity);
  };
  
  var setSecurity = function(error, cres, body) {
    if (cres.statusCode != 201) return respond(res, cres.statusCode, body);
          
    // Set database security
    request.put({
      url: db + '/_security',
      json: {
        admins: { names: [], roles: [] },
        readers: { names: [name], roles: [] }
      }
    }, createProfile);
  };
  
  var createProfile = function(error, cres, body) {
    if (cres.statusCode != 200 && cres.statusCode != 201) console.log('warning: something went wrong with security for', name);
                
    // Create user profile
    request.get({ url: config.couch + '/_uuids', json: true }, function(err, res, body) {
      request.put({
        url: db + '/' + body.uuids[0],
        json: {
          type: 'profile',
          user: name,
          registered: new Date().toJSON(),
          account_type: 'free trial'
        }
      }, done);
    });
  };
  
  var done = function(error, cres, body) {
    if (cres.statusCode != 201) return respond(res, cres.statusCode, body);

    request.post({ url: config.couch + '/_replicate', json: {
      source: 'lunacy/user/' + normalize(name),
      target: 'lunacy'
    }}, function(error, result, body) {
      var written = body.history.map(function(e) { return e.docs_written; }).reduce(function(n, m) { return n + m; }, 0);
      console.log('replicated %d docs from %s', written, name);

      console.log(new Date().toJSON(), 'registered', name);

      // Done
      respond(res, 201, { ok: true });
    });
  };
}
