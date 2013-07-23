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
  _id: '_design/general'
};

ddoc.views = {
  lib: couchapp.loadFiles('./lib'),
  game_info: {
    map: function(doc) {
      if (doc.game_id && doc.type != 'game_chat') emit(doc.game_id);
    }
  },
  games: {
    map: function(doc) {
      if (['game_shared_data', 'game_hidden_data', 'game_user_data', 'game_action', 'game_chat'].indexOf(doc.type) != -1)
        emit(doc.game_id, doc);
    },
    reduce: function(keys, values, rereduce) {
      var details = {
        action_needed: [],
        open_actions: [],
        ended: false,
        open: false,
        chat_info: {
          times: [],
          last_checks: {},
          new_messages: {}
        },
        last_update: 0
      };
      var actionReady = function(doc) {
        if (doc.done !== undefined) return doc.done;
        else if (doc.vote !== undefined) return !!doc.vote;
        else if (doc.selection !== undefined) return !!doc.selection;
        else return false;
      };
      var updateNewMessages = function() {
        if (details.players) details.players.forEach(function(player) {
          if (!details.chat_info.new_messages[player]) details.chat_info.new_messages[player] = 0;
          details.chat_info.new_messages[player] += details.chat_info.times.filter(function(time) {
            return time > (details.chat_info.last_checks[player] || 0);
          }).length;
        });
      };
      if (rereduce) {
        values.forEach(function(value) {
          for (var key in value) {
            if (key != 'action_needed' && key != 'chat_info' && key != 'last_update' && value[key])
              details[key] = value[key];
          }
          
          if (value.last_update > details.last_update) details.last_update = value.last_update;
          
          value.action_needed.forEach(function(user) {
            if (details.action_needed.indexOf(user) == -1) details.action_needed.push(user);
          });
            
          details.chat_info.times = details.chat_info.times.concat(value.chat_info.times);
          for (var user in value.chat_info.last_checks)
            details.chat_info.last_checks[user] = value.chat_info.last_checks[user];

          updateNewMessages();
        });

        details.chat_info.times = [];
      } else {
        details.id = values[0].game_id;
        
        values.forEach(function(doc) {
          switch (doc.type) {
            case 'game_shared_data':
              details.name = doc.name;
              details.n_vacancies = doc.n_vacancies;
              details.open = !!doc.open;
              details.players = Object.keys(doc.about);
              details.ended = !!doc.ended;
              var lastEvent = +new Date(doc.events[doc.events.length - 1].time);
              if (details.last_update < lastEvent) details.last_update = lastEvent;
              break;
            case 'game_action':
              var updated = +new Date(doc.updated || doc.issued);
              if (details.last_update < updated) details.last_update = updated;
              if (!actionReady(doc)) {
                details.action_needed.push(doc.user);
              }
              break;
            case 'game_user_data':
              if (doc.last_check)
                details.chat_info.last_checks[doc.user] = +new Date(doc.last_check);
              break;
            case 'game_chat':
              var time = +new Date(doc.time);
              details.chat_info.times.push(time);
              if (details.last_update < time) details.last_update = time;
          }
        });
        updateNewMessages();
      }
      return details;
    }
  },
  profiles: {
    map: function(doc) {
      if (doc.type && doc.type == 'profile') emit(doc.user, null);
    }
  },
  allowed_to_start: {
    map: function(doc) {
      if (doc.type == 'game_shared_data' && !doc.ended) {
        Object.keys(doc.about).forEach(function(player) {
          if (doc.about[player].tags.indexOf('dead') == -1) emit(player, -1);
        });
      } else if (doc.type == 'profile') {
        if (doc.account_type == 'full') {
          emit(doc.user, 9001);
        } else {
          emit(doc.user, 2);
        }
      }
    },
    reduce: '_sum'
  }
};

module.exports = ddoc;
