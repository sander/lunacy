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

angular.module('lunacy.services', []).
  factory('Storage', function($q, $rootScope, $http, $timeout) {
    var couch = {};
    var Storage = {};
    
    Storage.connect = function(user) {
      window.ondevcouchchange = function(doc) {
        if (couch[doc._id] && couch[doc._rev] && doc._rev && couch[doc._rev] == doc._rev) return;
        if (window.ddocs.server.filters.to_user(doc, { query: { user: user } }))
          Storage.put(doc, true);
      };
      window.devinit();
    }
    
    var broadcast = function(doc) {
      $timeout(function() {
        var change = {
          doc: doc,
          id: doc._id
        };
        $rootScope.$broadcast('change', change.doc);
        $rootScope.$broadcast('change/type:' + change.doc.type, change.doc);
        $rootScope.$broadcast('change/id:' + change.id, change.doc);
        if (change.doc.game_id) {
          if (change.doc.type == 'game_chat')
            $rootScope.$broadcast('change/game_chat:' + change.doc.game_id, change.doc);
          else
            $rootScope.$broadcast('change/game:' + change.doc.game_id, change.doc);
        } else if (change.doc.type == 'profile')
          $rootScope.$broadcast('change/profile:' + change.doc.user, change.doc);
      }, 0);
    };
    
    Storage.disconnect = function() {
    };

    Storage.put = function(doc, repl) {
      var deferred = $q.defer();
      
      if (!doc._id) doc._id = window.genid();

      if (couch[doc._id]) var old = couch[doc._id]._rev;
      else var old = 0;
      couch[doc._id] = doc;
      doc._rev = old + 1;
      broadcast(doc);
      
      if (!repl) devcouchput(doc, true);

      return deferred.promise;
    };
    
    Storage.query = function(view, params) {
      var deferred = $q.defer();

      $timeout(function() {
        var result = window.query(couch, view, params);
        deferred.resolve(result);
      }, 0);
      
      return deferred.promise;
    };
    
    Storage.attach = function(doc, name, data, type) {
      console.log('No attachments in dev mode');
    };
    
    Storage.attachment = function(id, name) {
      var deferred = $q.defer();

      console.log('No attachments in dev mode');
      $timeout(function() {
        deferred.reject();
      }, 0);

      return deferred.promise;
    };
    
    return Storage;
  }).
  factory('Auth', function($q, $rootScope, $http, $timeout, Storage) {
    function normalize(name) {
      // Only lowercase letters and numbers.
      return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    
    var set = function(user) {
      Auth.user = user;
      Storage.connect(user);
      $rootScope.$broadcast('signIn');
    };
    
    var Auth = {
      user: null,
      signIn: function(user, password) {
        var deferred = $q.defer();
        $timeout(function() {
          set(user);
          deferred.resolve();
        }, 0);
        return deferred.promise;
      },
      signOut: function() {
        Auth.user = null;
        $rootScope.$broadcast('signOut');
        var deferred = $q.defer();
        $timeout(function() {
          deferred.resolve();
        }, 0);
        return deferred.promise;
      },
      register: function(user, password) {
        var deferred = $q.defer();
        $timeout(function() {
          deferred.reject();
          console.log('No registrations in dev mode');
        }, 0);
        return deferred.promise;
      }
    };
    
    if (!Auth.user) set('Dev');
    
    return Auth;
  }).
  factory('OpenGames', function($q, $rootScope, $timeout, $http, Auth) {
    var open = [];

    return {
      list: function() {
        var deferred = $q.defer();
        $timeout(function() {
          deferred.resolve(open);
          $rootScope.$apply();
        }, 0);
        return deferred.promise;
      },
      join: function(id) {
        var deferred = $q.defer();
        $timeout(function() { deferred.reject(); }, 0);
        console.log('No open games in dev mode');
        return deferred.promise;
      }
    };
  });
