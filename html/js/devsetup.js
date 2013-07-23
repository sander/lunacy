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


(function() {
  function game() {
    group('creating game with id 0');
    var n = 7;
    var game = Game.create('0', {
      players: ['Dev'],
      founder: 'Dev',
      n_players: n,
      n_werewolves: 2,
      has_seer: true,
      has_hunter: true,
      has_priest: true,
      name: 'Wakeville'
    });
    for (var i = 1; i < n; i++)
      game.addPlayer('Bot ' + i, true);
    bulk(game.docs);
    end();
    get('0');
  }
  
  var devcouch = window.devcouch = {};
  
  var id = 0;
  var genid = window.genid = function genid() { return id++; };
  
  var put = window.devcouchput = function put(doc, repl) {
    if (!doc._id) doc._id = genid();
    if (devcouch[doc._id]) var old = devcouch[doc._id]._rev;
    else var old = 0;
    devcouch[doc._id] = doc;
    doc._rev = old + 1;
    log('putting doc type', doc.type, 'with id', doc._id);
    setTimeout(function() {
      broadcast(doc);
    }, 0);
    if (window.ondevcouchchange) window.ondevcouchchange(doc);
  };
  
  var bulk = function(docs) {
    docs.forEach(function(doc) { put(doc); });
  };
  
  function broadcast(doc) {
    if (doc.game_id && !handling(doc.game_id)) get(doc.game_id);
  }
  
  window.devinit = function devinit() {
    log('init, use devcouch to look up stuff');
    profile();
    game();
    
    // Chat test
    if (false) {
      var i = 0;
      var chat = function() {
        var chat = {
          _id: 'game_chat:' + i++,
          user: 'Bot 1',
          type: 'game_chat',
          game_id: '0',
          time: new Date().toJSON(),
          content: 'Hello!',
          access: ['Dev']
        };
        put(chat);
      };
      setInterval(chat, 2000);
      chat();
    }
  };
  
  function group() {
    var args = Array.prototype.slice.call(arguments).splice(1);
    args.splice(0, 0, '%cdev%c ' + arguments[0],
      'font-family: sans-serif; background: #999; color: #fff; padding: 0 2px; border-radius: 2px',
      'font-family: sans-serif; color: #666');
    console.groupCollapsed.apply(console, args);
  }
  function end() {
    console.groupEnd();
  }
  
  function log() {
    var args = Array.prototype.slice.call(arguments).splice(1);
    args.splice(0, 0, '%cdev%c ' + arguments[0],
      'font-family: sans-serif; background: #999; color: #fff; padding: 0 2px; border-radius: 2px',
      'font-family: sans-serif; color: #666');
    console.log.apply(console, args);
  }
  
  function profile() {
    put({
      type: 'profile',
      user: 'Dev',
      registered: new Date().toJSON(),
      account_type: 'free trial'
    });
  }

  var _handling = [];
  function handle(id) {
    _handling.push(id);
  }
  function handled(id) {
    _handling.splice(_handling.indexOf(id), 1);
  }
  function handling(id) {
    return _handling.indexOf(id) != -1;
  }
  
  function get(id) {
    handle(id);
    var result = query(devcouch, 'general/game_info', {
      include_docs: true,
      reduce: false,
      key: id
    });
    if (result.rows.length) {
      var game = new Game(result.rows.map(function(row) {
        return row.doc;
      }));
      setTimeout(function() {
        consider(game);
      }, 0);
    }
  }
  
  function consider(game) {
    if (game.ended) {
    } else if (game.ready) {
      group('handle ready game');
      Proceed.call(game);
      log('proceeding');
      bulk(game.docs);
      handled(game.id);
      end();
    } else {
      var docs = [];
      var grouped = false;
      game.action.forEach(function(action) {
        if (!action.ready && action.user.split(' ')[0] == 'Bot') {
          if (!grouped) {
            group('perform bot actions');
            grouped = true;
          }
          new RandomPlayer(game, action.user).perform(action);
          docs.push(action.toJSON());
        }
      });
      bulk(docs);
      if (grouped) end();
      handled(game.id);
    }
  }

})();
