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


function RandomPlayer(game, name) {
  this.game = game;
  this.name = name;
};

var coordination = null;

RandomPlayer.prototype = {
  perform: function(action) {
    if (coordination && coordination.seq_no != action.seq_no) coordination = null;
    switch (action.method) {
      case 'selection':
        if (!action.options) {
          console.log(action);
          return;
        }
        var selection = this.choose(action.options);
        this.log('I’m randomly choosing %s as %s.', selection, action.action_type);
        action.selection = selection;
        break;
      case 'vote':
        if (!action.options) {
          console.log(action);
          return;
        }
        if (coordination) {
          action.vote = coordination.vote;
          this.log('I’m following by voting %s as %s.', action.vote, action.action_type);
        } else {
          var selection = this.choose(action.options);
          action.vote = selection;
          this.log('I’m randomly voting %s as %s.', selection, action.action_type);
          coordination = {
            vote: selection,
            seq_no: action.seq_no
          };
        }
        break;
      case 'done':
        action.done = true;
        this.log('I’m done with %s.', action.action_type);
        break;
    }
  },
  log: function() {
    var args = Array.prototype.slice.call(arguments).splice(1);
    args.splice(0, 0, '%c%s%c ' + arguments[0],
      'font-family: sans-serif; background: rgb(66, 146, 75); color: #fff; padding: 0 2px; border-radius: 2px',
      this.name,
      'font-family: sans-serif; color: #666');
    console.log.apply(console, args);
  },
  choose: function(options) {
    return options[Math.floor(Math.random() * options.length)];
  }
};

if (typeof module !== 'undefined') module.exports = RandomPlayer;
if (typeof exports !== 'undefined') exports = RandomPlayer;
