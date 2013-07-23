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

angular.module('lunacy.directives', []).
  directive('role', function() {
    return {
      restrict: 'E',
      template: '<span class="roleImage"><img></span><span class="roleName"></span>',
      link: function(scope, element, attrs) {
        scope.$watch(attrs.tag, function() {
          var name = attrs.tag.split('/')[1];
          element.find('img').attr('src', 'images/rolicons/' + name + '.svg');
          element.find('.roleName').text(name);
        });
      }
    };
  }).
  directive('player', function($compile) {
    return {
      restrict: 'E',
      replace: true,
      transclude: true,
      template: '<span class="user"><b class="roleName" ng-transclude></b></user>',
      link: function(scope, element, attrs) {
      }
    };
  }).
  directive('avatar', function($q, $compile, Profile) {
    var avatars = {};
    return {
      restrict: 'E',
      template: '<img>',
      link: function(scope, element, attrs) {
        var set = function(src) { element.find('img').attr('src', src); };
        if (attrs.static) set(attrs.static);
        else scope.$watch(attrs.player, function(user) {
          if (avatars[user]) {
            avatars[user].then(set);
          } else {
            var deferred = $q.defer();
            if (user.indexOf('Bot ')) avatars[user] = deferred.promise;
            Profile.avatar({ user: user }).then(set);
            Profile.get(user).then(function(profile) {
              Profile.avatar(profile).then(function(avatar) {
                deferred.resolve(avatar);
                set(avatar);
              });
            });
          }
          scope.$on('change/profile:' + user, function(event, profile) {
            var deferred = $q.defer();
            avatars[user] = deferred.promise;
            Profile.avatar(profile).then(function(avatar) {
              deferred.resolve(avatar);
              set(avatar);
            });
          });
          $(element).tooltip({ container: 'body' });
        });
      }
    }
  }).
  directive('buttonToggle', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ctrl) {
        element.bind('click', function() {
          var checked = ctrl.$viewValue;
          $scope.$apply(function(scope) {
            ctrl.$setViewValue(!checked);
          });
        });
        $scope.$watch(attr.ngModel, function(newValue, oldValue) {
          if (newValue) element.addClass('active');
          else element.removeClass('active');
        });
      }
    };
  }).
  directive('scrollDown', function() {
    return function(scope, element, attrs) {
      var custom = false;
      scope.$watch(attrs.scrollDown, function() {
        if (!custom) setTimeout(function() {
          element.get(0).scrollTop = element.get(0).scrollHeight;
        }, 100);
      }, true);
      element.get(0).onscroll = function() {
        custom = (this.scrollTop + this.clientHeight) != this.scrollHeight;
      };
    };
  }).
  directive('ontap', function() {
    var isTouchDevice = !!('ontouchstart' in window);
    return function(scope, elm, attrs) {
      if (isTouchDevice) {
        var tapping = false;
        elm.bind('touchstart', function() { tapping = true; });
        elm.bind('touchmove', function() { tapping = false; });
        elm.bind('touchend', function() { 
          tapping && scope.$apply(attrs.ontap);
        });
      } else {
        elm.bind('click', function() {
          scope.$apply(attrs.ontap);
        });
      }
    };
  }).
  directive('externalHref', function(External) {
    return function(scope, elm, attrs) {
      elm.bind('click', function() {
        External.open(attrs.externalHref);
      });
    };
  }).
  directive('playerGrid', function() {
    return {
      restrict: 'E',
      link: function(scope, element, attrs) {
        var n;
        var nRoles;
        var players;
        var boundaries;
        function position() {
          var playerWidth = players.get(0).clientWidth;
          var playerHeight = players.get(0).clientHeight;
          var totalWidth = element.get(0).clientWidth;
          var perRow = Math.floor(totalWidth / playerWidth);
          var rows = Math.ceil(n / perRow);
          
          var roles = $(element).find('.rolesLeft');
          if (roles.find('role').length) {
            var rolesOnOwnRow = (players.length % perRow == 0) || (totalWidth - (players.length % perRow) * playerWidth) < roles.outerWidth();
            if (rolesOnOwnRow) {
              var pos = [0, rows++ * playerHeight];
            } else {
              var pos = [(players.length % perRow) * playerWidth, (rows - 1) * playerHeight];
            }
            roles.css({ webkitTransform: 'translate3d(' + pos[0] + 'px, ' + pos[1] + 'px, 0)' });
          }
          
          element.get(0).style.height = rows * playerHeight + 'px';

          var loaded = 0;
          boundaries = [];
          players = element.find('.player');
          players.each(function(i, player) {
            var x = (i % perRow) * playerWidth;
            var y = Math.floor(i / perRow) * playerHeight;

            boundaries.push({
              x1: x, x2: x + playerWidth,
              y1: y, y2: y + playerHeight
            });
            
            var img = $(player).find('img');
            function set() {
              this.isLoaded = true;
              var player = $(this).parents('.player');
              if (!player.hasClass('dragged'))
                player.css({ webkitTransform: 'translate3d(' + x + 'px, ' + y + 'px, 0)' });
              loaded++;
              if (loaded == n) setTimeout(function() { element.toggleClass('init', false); }, 0);
            }
            img.load(set);
            if (img.get(0).isLoaded) set.apply(img.get(0));
          });
        }
        function ondown(event) {
          event.preventDefault();

          var index = -1;
          var player = this;
          var original = -1;
          players.each(function(i) {
            if (this == player) original = i;
          });
          position();

          var onmove = function(event) {
            event.preventDefault();

            var pos = [
              event.clientX - $(player).data('start')[0],
              event.clientY - $(player).data('start')[1]
            ];
  
            $(player).css({ webkitTransform: 'translate(' + pos[0] + 'px, ' + pos[1] + 'px) ' + $(player).data('originalTransform') });
  
            var x = event.clientX - element.offset().left;
            var y = event.clientY - element.offset().top;
            index = -1;
            var previous = players.index(player);
            for (var i = 0; i < boundaries.length; i++) {
              var b = boundaries[i];
              if (b.x1 <= x && x <= b.x2 && b.y1 <= y && y <= b.y2) {
                index = i;
                break;
              }
            }
            if (index == -1) index = boundaries.length - 1;
            if (index != previous) {
              $(player).detach();
              if (index == players.length - 1) players.eq(players.length - 1).after(player);
              else if (index == 0) players.eq(0).before(player);
              else if (index < previous) players.eq(index).before(player);
              else if (index > previous) players.eq(index).after(player);
              position();
            }
          };
          $(document).mousemove(onmove).one('mouseup', function() {
            $(player).removeClass('dragged').data('start', undefined);
            $(player).css({ webkitTransform: $(this).data('originalTransform') });
            $(document).off('mousemove', onmove);
            position();

            if (index != -1 && index != original) {
              scope.$broadcast('reorder', players.toArray().map(function(player) {
                return $(player).find('.name:last').text();
              }));
            }
          });
          $(this).addClass('dragged').data({
            start: [event.clientX, event.clientY],
            originalTransform: $(this).css('webkitTransform')
          });
        }
        scope.$watch(function() { return element.html(); }, function() {
          players = element.find('.player');
          var roles = element.find('.rolesLeft role');
          if (n == players.length && nRoles == roles.length) return;
          n = players.length;
          nRoles = roles.length;
          if (!n) return;
          
          element.addClass('init');
          position();
          
          players.off('mousedown', ondown);
          players.on('mousedown', ondown);
        });
        $(window).resize(position);
      }
    };
  });
