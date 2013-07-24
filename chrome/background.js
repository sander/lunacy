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


var appwin;
var source;
var luser;
var notifications = [];

function listen() {
  return; // TODO the notification system currently doesn’t work well.
  source = new EventSource('http://playlunacy.com:7002/' + luser);
  source.addEventListener('chat', function(event) {
    var data = JSON.parse(event.data);
    var url = '#/game/' + data.game.id + '/chat';
    if (!appwin || appwin.contentWindow.location.hash != url) {
      var notification = webkitNotifications.createNotification(
        'images/icons/lunacy48.png',
        data.user + ' in ' + data.game.name,
        data.content
      );
      notification.onclick = function() {
        if (appwin)
          appwin.contentWindow.location.hash = url;
        else open(function() {
          appwin.contentWindow.location.hash = url;
        });
        notifications.forEach(function(notification) {
          notification.cancel();
        });
      };
      notifications.push(notification);
      notification.show();
    }
  }, false);
  source.addEventListener('turn', function(event) {
    var data = JSON.parse(event.data);
    if (!appwin) {
      var notification = webkitNotifications.createNotification(
        'images/icons/lunacy48.png',
        'It’s your turn in ' + ((data.number > 1) ? (data.number + ' games') : 'one game'),
        'Don’t keep your friends waiting!'
      );
      notification.onclick = function() {
        open();
        notifications.forEach(function(notification) {
          notification.cancel();
        });
      };
      notifications.push(notification);
      notification.show();
    }
  }, false);
}
function close() {
  source.close();
  source = null;
}

chrome.storage.local.get(['user'], function(val) {
  if (val.user) {
    luser = val.user;
    listen();
  }
});

function open(cb) {
  chrome.app.window.create('html/index.nocache.deploy.html', {
    id: 'app',
    minWidth: 320,
    maxWidth: 320,
    minHeight: 460,
    maxHeight: 548,
    singleton: true,
    frame: 'chrome'
  }, function(nappwin) {
    appwin = nappwin;
    if (cb) cb();
    appwin.contentWindow.userdetails = function(cb) {
      chrome.storage.local.get(['user', 'password'], cb);
    };
    appwin.contentWindow.onsignin = function(user, password) {
      chrome.storage.local.set({
        user: user,
        password: password
      });
      if (user != luser) {
        if (source) close();
        luser = user;
        listen();
      }
    };
    appwin.contentWindow.onsignout = function() {
      chrome.storage.local.set({
        user: null,
        password: null
      });
      if (source) close();
    };
    appwin.onClosed.addListener(function() {
      appwin = null;
    });
  });
}
chrome.app.runtime.onLaunched.addListener(open);
