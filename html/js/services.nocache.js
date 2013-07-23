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
  factory('Storage', function($q, $rootScope, $http, server, bouncer) {
    var couch;
    var source;
    var presence;
    var user;
    var Storage = {};

    Storage.connect = function(db, nuser) {
      couch = server + '/' + db;

      $http.get(couch).success(function(info) {
        var source = new EventSource(couch + '/_changes?feed=eventsource&include_docs=true&since=' + info.update_seq, {
          withCredentials: true
        });
        source.onmessage = function(event) {
          var change = JSON.parse(event.data);
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
        };
      });
      
      user = nuser;
      presence = new EventSource(bouncer + '/presence/' + encodeURIComponent(user));
      $http.get(bouncer + '/push/' + encodeURIComponent(user));
    };
    
    Storage.disconnect = function() {
      if (source) {
        source.close();
        source = null;
      }
      if (presence) {
        presence.close();
        presence = null;
      }
      if (couch) couch = null;
      if (user) user = null;
    };
    
    Storage.put = function(doc) {
      var deferred = $q.defer();

      $http.put(couch + '/' + encodeURIComponent(doc._id), doc).
        success(function(data) {
          deferred.resolve(data);
          if (user) $http.get(bouncer + '/push/' + encodeURIComponent(user));
        }).
        error(function(data) { deferred.reject(data); });
      return deferred.promise;
    };
    
    Storage.query = function(view, params) {
      var deferred = $q.defer();
      var qs = [];
      for (var key in params) qs.push(key + '=' + encodeURIComponent(JSON.stringify(params[key])));
      
      // CouchDB 1.3 RC bug: need to keep retrying
      var attempt = function() {
        $http.get(couch + '/_design/' + view.split('/')[0] + '/_view/' + view.split('/')[1] + '?' + qs.join('&')).
          success(function(data) { deferred.resolve(data); }).
          error(function(data, code) {
            if (code == 500) attempt();
            else
            deferred.reject(data);
          });
      };
      attempt();
      return deferred.promise;
    };
    
    Storage.attach = function(doc, name, data, type) {
      if (!doc._attachments) doc._attachments = {};
      doc._attachments[name] = {
        content_type: type,
        data: data
      };
      return Storage.put(doc);
    };

    Storage.attachment = function(id, name) {
      var deferred = $q.defer();
      
      var xhr = new XMLHttpRequest();
      xhr.open('GET', couch + '/' + id + '/' + name, true);
      xhr.withCredentials = true;
      xhr.responseType = 'blob';
      xhr.onload = function() {
        if (this.status != 200) return;
        deferred.resolve(URL.createObjectURL(this.response));
        $rootScope.$apply();
      };
      xhr.send();

      return deferred.promise;
    };
    
    return Storage;
  }).
  factory('Auth', function($q, $rootScope, $http, server, host, Storage) {
    function normalize(name) {
      // Only lowercase letters and numbers.
      return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    
    var set = function(user, password) {
      Auth.user = user;
      Auth.initialized = true;
      $rootScope.$broadcast('signIn');
      if (window.onsignin) window.onsignin(user, password);
      Storage.connect('lunacy%2Fuser%2F' + normalize(user), user);
    };
    
    var Auth = {
      user: null,
      initialized: false,
      signIn: function(user, password) {
        var deferred = $q.defer();
        $http.post(server + '/_session', {
          name: user,
          password: password
        }, {
          withCredentials: true
        }).success(function(data, status, headers) {
          set(user, password);
          deferred.resolve();
        }).error(function() {
          deferred.reject();
        });
        return deferred.promise;
      },
      signOut: function() {
        Auth.user = null;
        $rootScope.$broadcast('signOut');
        var deferred = $q.defer();
        $http.delete(server + '/_session').success(function() {
          deferred.resolve();
        });
        if (window.onsignout) window.onsignout();
        return deferred.promise;
      },
      register: function(user, password) {
        var deferred = $q.defer();
        $http.post(host + '/register', {
          name: user,
          password: password
        }).success(function() {
          deferred.resolve();
        }).error(function() {
          deferred.reject();
        });
        return deferred.promise;
      }
    };
    
    if (!Auth.user) $http.get(server + '/_session').success(function(data) {
      var fail = function() {
        Auth.initialized = true;
        $rootScope.$broadcast('signOut');
        if (window.onsignout) window.onsignout();
      };
      if (data && data.userCtx && data.userCtx.name) {
        set(data.userCtx.name);
      } else {
        var details = null;
        if (window.userdetails)
          window.userdetails(function(user, password) {
            if (!user || !password) return fail();
            Auth.signIn(user, password).then(function() {}, fail);
          });
        else fail();
      }
    });
    
    return Auth;
  }).
  factory('OpenGames', function($q, $rootScope, $timeout, $http, gamemaster, Auth) {
    var open = [];
    
    var source = new EventSource(gamemaster + '/open');
    source.onmessage = function(event) {
      open = JSON.parse(event.data);
      $rootScope.$broadcast('change/open');
    };

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
        $http.post(gamemaster + '/join', {
          id: id,
          user: Auth.user
        }).success(function() {
          deferred.resolve();
        }).error(function() {
          deferred.reject();
        });
        return deferred.promise;
      }
    };
  }).
  service('External', function() {
    this.open = function(url) {
      window.open(url);
    };
  });
