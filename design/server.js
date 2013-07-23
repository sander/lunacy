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
  _id: '_design/server'
};

ddoc.views = {
  lib: couchapp.loadFiles('./lib'),
  open_games: {
    map: function(doc) {
      if (doc.type == 'game_shared_data' && doc.open)
        emit(doc.game_id);
    }
  },
  game_info: {
    map: function(doc) {
      if (doc.game_id && doc.type != 'game_chat') emit(doc.game_id);
    }
  },
  games: {
    map: function(doc) {
      if (doc.type == 'game_shared_data')
        emit(doc.game_id, {
          id: doc.game_id,
          name: doc.name,
          n_vacancies: doc.n_vacancies,
          open: doc.open,
          players: Object.keys(doc.about),
          ended: doc.ended
        });
    }
  },
  profiles: {
    map: function(doc) {
      if (doc.type == 'profile') emit(doc.user);
    }
  },
  conflicts: {
    map: function(doc) {
      if (doc._conflicts) {
        emit(doc._conflicts, null);
      }
    }
  },
  connections: {
    map: function(doc) {
      if (doc.type == 'game_shared_data') {
        Object.keys(doc.about).forEach(function(player, i, players) {
          players.forEach(function(other) {
            if (player != other) {
              emit([player, other], 1);
            }
          });
        });
      } else if (doc.type == 'friendship') {
        emit([doc.user, doc.friend], 9000);
      }
    },
    reduce: '_sum'
  }
};

ddoc.filters = {
  to_user: function(doc, req) {
    if (req && req.hasOwnProperty('query') && req.query.hasOwnProperty('user')) {
      var user = req.query.user;
      
      if (doc._id == '_design/user' || doc._id == '_design/general') return true;
      if (doc.user == user) return true;
      if (doc.access && (typeof doc.access.indexOf) === 'function' && doc.access.indexOf(user) != -1) return true;

      if (req.query.hasOwnProperty('profiles')) {
        var profiles = JSON.parse(req.query.profiles);
        if (profiles && req.query.profiles.indexOf(doc._id) != -1) {
          return true;
        }
      }
    }
    return false;
  }
};

module.exports = ddoc;
