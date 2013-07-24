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

function AppCtrl($rootScope, $scope, $timeout, $location, $navigate, Auth, dev) {
  $scope.user = Auth.user;
  $scope.navigate = $navigate;
  $rootScope.games = [];
  
  var initial = $location.path().substr(1);
  
  $scope.$on('signOut', function() {
    $scope.user = null;
    $navigate.go('/sign-in', 'none');
  });
  
  $scope.$on('signIn', function() {
    $scope.user = Auth.user;
    if (initial) {
      $timeout(function() {
        $navigate.go(initial, 'none');
        if (['$apply', '$digest'].indexOf($rootScope.$$phase) == -1)
          $rootScope.$apply();
      }, 0);
    }
  });
  
  // TODO(sander) wait with executing this before /_session has been requested
  $scope.$on('$routeChangeStart', function(event, next, current) {
    if (!$scope.user && (!next.$route || next.$route.templateUrl != 'partials/sign-in.html'))
      $navigate.go('/sign-in', 'none');
  });
}

function DashboardCtrl($rootScope, $scope, Game, OpenGames, Auth, Profile, $navigate) {
  var get = function() {
    Game.list().then(function(list) {
      $rootScope.games = list.filter(function(game) {
        return !game.open;
      });
    });
  };
  get();

  $scope.$on('change/type:game_shared_data', function(event, change) {
    $scope.$apply(get);
  });
  
  $scope.$on('change/type:game_chat', function(event, doc) {
    $scope.games.forEach(function(game) {
      if (game.id == doc.game_id) {
        game.chat_info.new_messages[Auth.user]++;
        $scope.$apply();
      }
    });
  });

  $scope.prepare = function(name) {
    $rootScope.game = null;
    $rootScope.action = null;
    $rootScope.currentName = name;
  };
  
  function getOpen() {
    $scope.open = $scope.open || [];
    OpenGames.list().then(function(open) {
      $scope.open = open;
    });
  }
  getOpen();
  $scope.$on('change/open', function(event, change) {
    $scope.$apply(getOpen);
  });
  
  $scope.waitingFilter = function(game) {
    return game.action_needed.indexOf($scope.user) == -1 && game.ended == false;
  };
  $scope.activeFilter = function(game) {
    return game.action_needed.indexOf($scope.user) != -1 || game.last_update > +new Date() - 1000 * 60 * 60 * 24;
  };
  $scope.inactiveFilter = function(game) {
    return game.action_needed && game.action_needed.indexOf($scope.user) == -1 && game.last_update < +new Date() - 1000 * 60 * 60 * 24;
  };

  $scope.joinOpen = function joinOpen(game) {
    if (game.players && game.players.indexOf($scope.user) != -1) {
      $scope.prepare(game.name);
      $navigate.go('/game/' + game.id + '/main', 'slide');
      console.log('already in');
    } else {
      if (game.joining) return;
      game.joining = true;
      OpenGames.join(game.id).then(function() {
        game.joining = false;
        var shared = false;
        var user = false;
        var action = false;
        var deregister = $scope.$on('change/game:' + game.id, function(event, doc) {
          if (doc.type == 'game_shared_data') shared = true;
          if (doc.type == 'game_user_data') user = true;
          if (doc.type == 'game_action') action = true;
          if (shared && user && action) {
            deregister();
            console.log('ready repl');
          }
        });
        $scope.prepare(game.name);
        $navigate.go('/game/' + game.id + '/main', 'slide');
        console.log('open');
      }, function(error) {
        game.joining = false;
        game.failed_to_join = true;
        location = '#/upgrade';
      });
    }
  };
  
  Profile.get(Auth.user).then(function(profile) {
    if (!(profile && profile._id && profile._attachments && profile._attachments.avatar))
      $scope.hasAvatar = false;
  });
}

function SignInCtrl($scope, $location, $navigate, Auth, dev) {
  if (Auth.user) $location.path('/dashboard');
  
  $scope.$on('signIn', function() {
    $location.path('/dashboard');
  });
  
  $scope.signIn = function() {
    $scope.busy = true;
    localStorage.name = $scope.name;
    localStorage.password = $scope.password;
    Auth.signIn($scope.name, $scope.password).then(function() {
      $navigate.go('/dashboard', 'fade');
    }, function() {
      $scope.busy = false;
      $scope.error = 'signIn';
    });
  };
  
  $scope.register = function() {
    $scope.busy = true;
    var name = $scope.name.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
    if (!name) {
      $scope.busy = false;
      $scope.error = 'register';
      return;
    }
    Auth.register(name, $scope.password).then(function() {
      $scope.signIn();
    }, function(error) {
      $scope.busy = false;
      $scope.error = 'register';
    });
  };

  if (localStorage.name && localStorage.password) {
    $scope.name = localStorage.name;
    $scope.password = localStorage.password;
    $scope.signIn();
  }
}

function SettingsCtrl($scope, Auth, Profile, Storage) {
  $scope.signOut = function() {
    localStorage.name = '';
    localStorage.password = '';
    Auth.signOut();
  };
  
  Profile.get(Auth.user).then(function(profile) {
    $scope.profile = profile;
  });
  
  $scope.$on('change/profile:' + Auth.user, function(event, doc) {
    $scope.profile = doc;
  });
}

function GameCtrl($rootScope, $scope, $routeParams, $timeout, Game, Auth) {
  $scope.view = $routeParams.view;
  if (!$rootScope.game) {
    $rootScope.game = {
      loading: true,
      shared: {
        name: $rootScope.currentName
      }
    };
  }

  var getGame = function() {
    Game.get($routeParams.id).then(function(game) {
      $rootScope.game = game;
      window.game = game;
      $rootScope.action = game.next($scope.user);
      
      // Special illustration?
      $scope.illustration = null;
      if ($scope.action) switch($scope.action.action_type) {
        case 'hunter_pick':
          if ($scope.action.data.attack_type == 'werewolves')
            $scope.illustration = 'hunter_pick_night';
          else if ($scope.action.data.attack_type == 'hanging')
            $scope.illustration = 'hunter_pick_day';
          break;
        case 'hunting':
          if (game.players.werewolves.array.indexOf($scope.action.data.hunted) > -1)
            $scope.illustration = 'hunting_werewolf';
          else
            $scope.illustration = 'hunting_nonwerewolf';
          break;
      }
      
      var roles = Array(game.players.length + game.shared.n_vacancies);
      var i;
      for (i = 0; i < game.shared.n_werewolves; i++) roles[i] = 'role/werewolf';
      if (game.shared.has_seer) roles[i++] = 'role/seer';
      if (game.shared.has_priest) roles[i++] = 'role/priest';
      if (game.shared.has_hunter) roles[i++] = 'role/hunter';
      for (; i < roles.length; i++) roles[i] = 'role/civilian';
      game.players.forEach(function(player) {
        game.roles(player).forEach(function(role) {
          roles.splice(roles.indexOf(role), 1);
        });
      });
      $rootScope.rolesLeft = roles;

      $timeout(function() {
        $('.role, .emblem').tooltip({ container: 'body' });
      }, 0);
    }, function(error) {
      console.log('Error loading game. Returning…');
      location.hash = '';
    });
  };
  if (!$rootScope.game || $rootScope.game.id != $routeParams.id) getGame();
  $scope.$on('change/game:' + $routeParams.id, function(event, doc) {
    $scope.$apply(getGame);
  });
  $scope.save = function(action) {
    action.updated = new Date().toJSON();
    Game.save(action);
  };
  
  $scope.news = 0;
  Game.info($routeParams.id).then(function(info) {
    $scope.news = info.chat_info.new_messages[Auth.user];
  });
  $scope.$on('change/game_chat:' + $routeParams.id, function(event) {
    $scope.news++;
  });
  
  $scope.$on('reorder', function(event, order) {
    var doc = $scope.game.user[$scope.user];
    doc.order = order;
    Game.save(doc);
  });
};

function ChatCtrl($rootScope, $scope, $routeParams, Game, Auth, Storage) {
  var setViewed = function() {
    Game.get($routeParams.id).then(function(game) {
      var doc = game.user[Auth.user];
      doc.last_check = new Date().toJSON();
      Storage.put(doc);
    });
  };
  
  $scope.message = $rootScope.draft || '';
  $scope.messages = [];
  var get = function() {
    Game.getHistory($routeParams.id).then(function(messages) {
      $scope.messages = messages;
      setViewed();
    });
  };
  get();
  $scope.$on('change/game_chat:' + $routeParams.id, function(event, doc) {
    $scope.$apply(get);
  });
  $scope.send = function() {
    Game.chat($scope.game, this.message);
    $rootScope.draft = this.message = '';
  };
  $scope.remember = function() {
    $rootScope.draft = this.message;
  };
}

function FriendsCtrl($scope, Profile) {
  $scope.names = [];
  $scope.friends = [];
  $scope.editing = false;
  $scope.removing = {};
  
  var getNames = function() {
    Profile.list().then(function(names) {
      $scope.names = names;
    });
  };
  getNames();
  
  $scope.$on('change/type:profile', function() {
    getNames();
  });
  
  var getFriends = function() {
    Profile.friends().then(function(friends) {
      $scope.friends = friends;
    });
  };
  getFriends();
  
  $scope.$on('change/type:friendship', function() {
    getFriends();
  });

  $scope.befriend = function(name) {
    $scope.busy = true;
    $scope.error = null;
    if ($scope.names.indexOf(name) != -1) {
      Profile.befriend(name).then(function() {
        $scope.name = '';
        $scope.busy = false;
      }, function() {
        $scope.error = 'notFound';
        $scope.busy = false;
      });
    } else {
      $scope.error = 'notFound';
      $scope.busy = false;
    }
  }
  
  $scope.remove = function(friend) {
    if (!$scope.editing) return;
    $scope.removing[friend] = true;
    Profile.unfriend(friend).then(function() {
      $scope.removing[friend] = false;
    });
  };
}

function CreateCtrl() {
}

function UpgradeCtrl($rootScope, $scope) {
  $scope.start = function() {
    open('http://server.playlunacy.com:7001/?user=' + encodeURIComponent($scope.user));
  }
}

function ChooseAvatarCtrl($scope, Profile, Auth, Storage) {
  Profile.get(Auth.user).then(function(profile) {
    $scope.profile = profile;
  });
  
  $scope.$on('change/profile:' + Auth.user, function(event, doc) {
    $scope.profile = doc;
  });

  $scope.initUpload = function() {
    $('input[type="file"]').change(function() {
      $scope.upload(this.files[0]);
    });
  };
  $scope.upload = function(file) {
    if (!$scope.profile) return;
    if (!file) return;
    
    if (file.size > 50 * 1024) {
      $scope.error = 'avatarSize';
      $scope.$apply();
      return;
    }
    
    var reader = new FileReader();
    reader.onloadend = function(e) {
      var base64 = e.target.result.split(/,/)[1];
      Storage.attach($scope.profile, 'avatar', base64, file.type).then(function() {
        $scope.newAvatar = null;
      });
    };
    reader.readAsDataURL(file);
  };
  $scope.showUpload = function() {
    $('input[type="file"]').trigger('click');
  };
  
  $scope.select = function(name) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '../visuals/avatars/' + name, true);
    xhr.responseType = 'blob';
    xhr.onload = function() {
      if (this.status != 200) return;
      $scope.upload(this.response);
      $scope.$apply();
    };
    xhr.send();
  }
}
