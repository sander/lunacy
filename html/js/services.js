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


'use strict';

angular.module('lunacy.commonServices', []).
  factory('Profile', function($q, $timeout, Storage, Auth) {
    var Profile = {};
    
    Profile.get = function(user) {
      var deferred = $q.defer();
      Storage.query('general/profiles', {
        include_docs: true,
        key: user,
        reduce: false
      }).then(function(result) {
        if (result.rows.length) deferred.resolve(result.rows[0].doc);
        else deferred.reject();
      });
      return deferred.promise;
    };

    Profile.avatar = function(profile) {
      if (profile && profile._id && profile._attachments && profile._attachments.avatar) {
        return Storage.attachment(profile._id, 'avatar');
      } else {
        var deferred = $q.defer();
        $timeout(function() {
          if (profile && profile.user && profile.user.split(' ')[0] == 'Bot')
            deferred.resolve('images/robot.png');
          else
            deferred.resolve('images/default-avatar.png');
        }, 0);
        return deferred.promise;
      }
    };
    
    Profile.list = function() {
      var deferred = $q.defer();
      Storage.query('general/profiles', {}).then(function(result) {
        deferred.resolve(result.rows.map(function(row) {
          return row.key;
        }).filter(function(name) {
          return name != Auth.user;
        }));
      });
      return deferred.promise;
    };
    
    Profile.friends = function() {
      var deferred = $q.defer();
      Storage.query('user/friends', {
        startkey: [Auth.user],
        endkey: [Auth.user, {}]
      }).then(function(result) {
        deferred.resolve(result.rows.map(function(row) {
          return row.key[1];
        }));
      });
      return deferred.promise;
    };
    
    Profile.befriend = function(user) {
      var deferred = $q.defer();
      var doc = {
        _id: 'friendship:' + encodeURIComponent(Auth.user) + ':' + encodeURIComponent(user),
        type: 'friendship',
        time: new Date().toJSON(),
        user: Auth.user,
        friend: user,
        access: [Auth.user, user]
      };
      Storage.put(doc);
      $timeout(function() {
        deferred.resolve();
      }, 0);
      return deferred.promise;
    };
    
    Profile.unfriend = function(user) {
      var deferred = $q.defer();
      Storage.query('user/friends', {
        key: [Auth.user, user],
        include_docs: true
      }).then(function(result) {
        if (result.rows.length) {
          var doc = result.rows[0].doc;
          console.log(doc);
          doc._deleted = true;
          Storage.put(doc);
          deferred.resolve();
        } else {
          console.log('rej');
          deferred.reject();
        }
      });
      return deferred.promise;
    };
    
    return Profile;
  }).
  factory('Game', function($q, $rootScope, Auth, Storage) {
    var resolve = function(deferred, result, error) {
      if (error) deferred.reject(error)
      else deferred.resolve(result);
    };

    return {
      chat: function(game, message) {
        Storage.put({
          _id: 'game_chat:' + uuid.v4().replace(/-/g, ''),
          user: Auth.user,
          type: 'game_chat',
          game_id: game.id,
          time: new Date().toJSON(),
          content: message,
          access: game.players.array
        });
      },
      save: function(doc) {
        if (doc.toJSON) Storage.put(doc.toJSON());
        else Storage.put(doc);
      },
      get: function(id) {
        var deferred = $q.defer();
        Storage.query('general/game_info', {
          include_docs: true,
          reduce: false,
          key: id
        }).then(function(result) {
          if (result && result.rows.length) {
            var docs = new Game(result.rows.map(function(row) {
              return row.doc;
            }));
          } else var err = 'game not found';
          resolve(deferred, docs);
        });
        return deferred.promise;
      },
      getHistory: function(id) {
        var deferred = $q.defer();
        Storage.query('user/history', {
          reduce: false,
          startkey: [id],
          endkey: [id, {}]
        }).then(function(result) {
          var messages;
          if (result && result.rows.length) messages = result.rows.map(function(row) {
            return row.value;
          }); else messages = [];
          resolve(deferred, messages);
        });
        return deferred.promise;
      },
      list: function() {
        var deferred = $q.defer();
        Storage.query('general/games', {
          reduce: true,
          group: true
        }).then(function(result) {
          resolve(deferred, result.rows.map(function(row) {
            return row.value;
          }));
        });
        return deferred.promise;
      },
      info: function(id) {
        var deferred = $q.defer();
        Storage.query('general/games', {
          reduce: true,
          group: true,
          key: id
        }).then(function(result) {
          resolve(deferred, result.rows[0].value);
        });
        return deferred.promise;
      }
    };
  });
