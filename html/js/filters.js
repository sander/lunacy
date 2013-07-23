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

angular.module('lunacy.filters', []).
  filter('name', function() {
    return function(text) {
      return String(text).split('/')[1];
    };
  }).
  filter('empty', function() {
    return function(array) {
      if (!array) return true;
      else return array.length == 0;
    };
  }).
  filter('range', function() {
    return function(arr, total) {
      total = parseInt(total);
      for (var i = 0; i < total; i++)
        arr.push(i);
      return arr;
    };
  }).
  filter('avatar', function() {
    return function(player) {
      if (player.split(' ')[0] == 'Bot')
        return 'images/robot.png';
      else
        return 'images/default-avatar.png';
    };
  }).
  filter('votable', function() {
    return function(player, action) {
      var method = '';
      try { method = action.method; } catch (e) {}
      return action && action.method == 'vote' && action.options.indexOf(player) != -1;
    };
  }).
  filter('selectable', function() {
    return function(player, action) {
      var method = '';
      try { method = action.method; } catch (e) {}
      return action && action.method == 'selection' && action.options.indexOf(player) != -1;
    };
  });
