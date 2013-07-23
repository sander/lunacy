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


var couchapp = require('couchapp');
var path = require('path');

var ddoc = {
  _id: '_design/user'
};

ddoc.views = {
  lib: couchapp.loadFiles('./lib'),
  history: {
    map: function(doc) {
      if (doc.game_id) {
        if (doc.type == 'game_chat')
          emit([doc.game_id, new Date(doc.time).getTime()], doc);
        else if (doc.events) doc.events.forEach(function(event) {
          emit([doc.game_id, new Date(event.time).getTime()], event);
        });
      }
    }
  },
  friends: {
    map: function(doc) {
      if (doc.type == 'friendship')
        emit([doc.user, doc.friend]);
    }
  }
};

ddoc.filters = {
  no_design: function(doc) {
    return doc._id.indexOf('_design/') != 0;
  }
};

ddoc.validate_doc_update = function(newDoc, oldDoc, userCtx) {
  if (userCtx.roles.indexOf('_admin') >= 0) {
    return;
  }
  if (oldDoc) {
    if ((['game_action', 'profile', 'game_user_data'].indexOf(oldDoc.type) > -1) && (oldDoc.type == newDoc.type) && (oldDoc.user = newDoc.user)) {
      return;
    } else {
      throw({ forbidden: 'not allowed to update this doc type' });
    }
  } else {
    if ((['game_chat', 'friendship'].indexOf(newDoc.type) > -1) && (newDoc.user == userCtx.name)) {
      return;
    } else {
      throw({ forbidden: 'not allowed to create this doc type' });
    }
  }
};


module.exports = ddoc;
