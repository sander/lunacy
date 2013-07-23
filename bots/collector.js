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


var fs = require('fs');
var http = require('http');
var jwt = require('jwt-simple');
var querystring = require('querystring');
var request = require('request');

var config = require('../config/config');

var db = config.couch + '/' + config.db;

var secret = config.googleWalletSecret;

var payload = function(user) {
  return {
    iss: '15622554870054216562',
    aud: 'Google',
    typ: 'google/payments/inapp/item/v1',
    exp: Date.now(),
    iat: Date.now() + 1000 * 60 * 60,
    request: {
      name: 'Lunacy',
      description: 'Access to the full version of Lunacy for ' + user,
      price: '1.49',
      currencyCode: 'EUR',
      sellerData: user
    }
  };
}

function handlePage(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/html'
  });
  var form = querystring.parse(req.url.substr(2));
  fs.readFile('bots/collector.html', function(error, content) {
    var str = form.user.replace('<', '&lt;').replace('>', '&gt;').replace('\'', '\\').replace('\n', '\\n');
    res.end(content.toString().replace('%USER%', str), 'utf-8');
    console.log('considering:', str);
  });
}

function handlePayload(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });
  var data = '';
  req.on('data', function(chunk) { data += chunk; });
  req.on('end', function() {
    var form = querystring.parse(data);
    var user = form.user;
    var token = jwt.encode(payload(user), secret);
    res.end(token);
  });
}

function handlePostback(req, res) {
  var body = '';
  req.on('data', function(chunk) { body += chunk.toString(); });
  req.on('end', function() {
    var form = querystring.parse(body);
    
    var data = jwt.decode(form.jwt, secret);
    var user = data.request.sellerData;
    var test = payload(user);
    if ((data.iss != 'Google') ||
        (data.aud != test.iss) ||
        (data.typ != 'google/payments/inapp/item/v1/postback/buy') ||
        (data.request.name != 'Lunacy')) res.end();

    console.log('paid: ' + user);
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data.response.orderId);
    
    makePro(user);
  });
}

function makePro(user) {
  request.get({ url: db + '/_design/server/_view/profiles?key=' + encodeURIComponent(JSON.stringify(user)), json: true }, function(err, res, body) {
    var url = db + '/' + body.rows[0].id;
    request.get({
      url: url,
      json: true
    }, function(error, res, body) {
      body.account_type = 'full';
      request.put({
        url: url,
        json: body
      }, function(error, response, body) {
        if (error) console.log('error: ', error);
        else console.log('upgraded ' + user);
      });
    });
  });
}

http.createServer(function(req, res) {
  if (req.method == 'POST' && req.url == '/payload') {
    handlePayload(req, res);
  } else if (req.method == 'POST' && req.url == '/postback') {
    handlePostback(req, res);
  } else if (req.url == '/favicon.ico') {
    res.end();
  } else {
    handlePage(req, res);
  }
}).listen(config.ports.collector, '0.0.0.0');
