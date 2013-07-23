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

// Declare app level module which depends on filters, and services
angular.module('lunacy', ['mobile-navigate', 'lunacy.filters', 'lunacy.configServices', 'lunacy.services', 'lunacy.commonServices', 'lunacy.directives']).
  config(function($routeProvider, $httpProvider) {
    $httpProvider.defaults.withCredentials = true;
    
    $routeProvider.when('/dashboard', {
      templateUrl: 'partials/dashboard.html',
      controller: DashboardCtrl
    }).when('/friends', {
      templateUrl: 'partials/friends.html',
      controller: FriendsCtrl,
      transition: 'modal'
    }).when('/create', {
      templateUrl: 'partials/create.html',
      controller: CreateCtrl
    }).when('/upgrade', {
      templateUrl: 'partials/upgrade.html',
      controller: UpgradeCtrl
    }).when('/settings', {
      templateUrl: 'partials/settings.html',
      controller: SettingsCtrl,
      transition: 'modal'
    }).when('/game/:id/:view', {
      templateUrl: 'partials/game.html',
      controller: GameCtrl
    }).when('/sign-in', {
      templateUrl: 'partials/sign-in.html',
      controller: SignInCtrl
    }).otherwise({
      redirectTo: '/dashboard'
    });
  });
