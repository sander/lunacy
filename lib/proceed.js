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

function proceed() {
  var game_id = this.shared.game_id;
  var seq_no = ++this.shared.seq_no;
  var data = this.hidden.seq_data;

  var changeTime = true;

  this.hidden.seq_no = seq_no;
  this.hidden.seq_data = {};
  
  // Helper functions
  function cleanup(game, type) {
    var actions = game.actionsReady(type, seq_no - 1);
    if (actions) {
      actions.forEach(function(action) {
        action._deleted = true;
      });
      return true;
    } else {
      return false;
    }
  }

  function finished(game) {
    // Is the game finished?
    var alive = game.players.alive.length;
    if (alive == 0) {
      game.shared.ended = {
        winners: [],
        winner_description: 'tie'
      };
      game.event('shared', {
        action: 'win',
        subject: []
      });
    } else if (alive == game.players.alive.werewolves.length) {
      game.shared.ended = {
        winners: game.players.alive.werewolves.array,
        winner_description: 'werewolves'
      };
      game.event('shared', {
        action: 'win',
        subject: game.players.alive.werewolves.array
      });
    } else if (alive == game.players.alive.nonWerewolves.length) {
      game.shared.ended = {
        winners: game.players.alive.nonWerewolves.array,
        winner_description: 'non_werewolves'
      };
      game.event('shared', {
        action: 'win',
        subject: game.players.alive.nonWerewolves.array
      });
    }
    if (!!game.shared.ended) {
      game.players.forEach(function(player) {
        if (!game.hidden.about[player]) game.hidden.about[player] = { tags: [] };
        var about = game.hidden.about[player];
        game.roles(player).forEach(function(role) {
          if (about.tags.indexOf(role) == -1) about.tags.push(role);
        });
      });
      game.hidden.access = game.players.array;
      game.action.forEach(function(action) {
        action._deleted = true;
      });
      attacks = [];
      return true;
    } else return false;
  }

  // Call to start killing a player
  var attacks = [];
  var Attack = function(player, type) {
    this.player = player;
    this.type = type;
    this.events = [];
    this.actions = [];
  };
  Attack.prototype.event = function(target, event) {
    this.events.push([target, event]);
    return this;
  };
  Attack.prototype.action = function(doc) {
    this.actions.push(doc);
    return this;
  };
  var attack = function(player, type) {
    var attack = new Attack(player, type);
    attacks.push(attack);
    return attack;
  };
  var handleAttacks = function(attacks, preAttackWorkDone) {
    attacks.forEach(function(attack) {
      var alsoDying = [];
      var delayed = false;
      var delay = function(attack) {
        if (!this.hidden.seq_data.attacks)
          this.hidden.seq_data.attacks = [];
        if (!this.hidden.seq_data.attacks.filter(function(a) { attack.player == a.player }).length)
          this.hidden.seq_data.attacks.push({
            player: attack.player,
            events: attack.events,
            actions: attack.actions
          });
        delayed = true;
      }.bind(this);
      if (this.players.alive.hunter == attack.player && !preAttackWorkDone) {
        var options = this.players.alive.exceptFor(attack.player);
        this.add({
          type: 'game_action',
          game_id: game_id,
          user: attack.player,
          access: attack.player,
          action_type: 'hunter_pick',
          data: {
            attack_type: attack.type
          },
          issued: new Date(),
          selection: (options.length == 1) ? options.array[0] : null,
          options: options,
          seq_no: seq_no
        });
        delay(attack);
        changeTime = false;
      }
      if (this.players.alive.mayor == attack.player && !preAttackWorkDone) {
        var options = this.players.alive.exceptFor(attack.player);
        alsoDying.forEach(function(player) { options = options.exceptFor(player); });
        this.add({
          type: 'game_action',
          game_id: game_id,
          user: attack.player,
          access: this.players.alive,
          action_type: 'mayor_testament',
          issued: new Date(),
          selection: (options.length == 1) ? options.array[0] : null,
          options: options,
          seq_no: seq_no,
          data: {
            attack_type: attack.type
          }
        });
        delay(attack);
        changeTime = false;
      }
      if (delayed) return;
      this.kill(attack.player);
      attack.events.forEach(function(data) {
        this.event(data[0], data[1]);
      }, this);
      attack.actions.forEach(function(action) {
        action.type = 'game_action';
        action.game_id = this.id;
        action.issued = new Date();
        action.seq_no = seq_no;
        this.add(action);
      }, this);
      var tags = this.shared.about[attack.player].tags;
      this.user[attack.player].about[attack.player].tags.forEach(function(tag) {
        if (tag.split('/')[0] == 'role' && tags.indexOf(tag) == -1)
          tags.push(tag);
      }, this);
    }, this);
  }.bind(this);
  var attacked = function(player) {
    return !!attacks.filter(function(attack) { return attack.player == player; }).length;
  };
  var save = function(player) {
    attacks = attacks.filter(function(attack) { return attack.player != player; });
  };

  // Simple info cleanups
  cleanup(this, 'seeing');
  cleanup(this, 'accept_eaten');
  cleanup(this, 'hanging');
  cleanup(this, 'mayor_succession');
  cleanup(this, 'hunting');
  cleanup(this, 'accept_mayor');
  if (cleanup(this, 'accept_role')) {
    this.event('shared', {
      action: 'see_role',
      subject: this.players
    });
  }

  // Handle werewolf votes
  var werewolfVote = this.actionsReady('werewolf_vote', seq_no - 1);
  if (werewolfVote) {
    var victim = werewolfVote[0].vote;
    var attack = attack(victim, 'werewolves').event('shared', {
      action: 'eat',
      object: [victim]
    });
    this.players.alive.werewolves.forEach(function(werewolf) {
      attack.event('user/' + werewolf, {
        action: 'eat',
        subject: this.players.alive.werewolves.toJSON(),
        object: [victim]
      });
    }, this);
    this.players.alive.forEach(function(user) {
      if (user == victim) return;
      attack.action({
        user: user,
        access: [user],
        action_type: 'accept_eaten',
        done: false,
        data: {
          victim: victim,
          roles: this.roles(victim)
        }
      });
    }, this);
    werewolfVote.forEach(function(action) {
      action._deleted = true;
    });
  }
  
  // Maybe cancel werewolf attack by priester pick
  var priestPick = this.actionsReady('priest_pick', seq_no - 1);
  if (priestPick) {
    priestPick.forEach(function(action) {
      action._deleted = true;

      if (attacked(action.selection)) {
        save(action.selection);
        
        this.players.alive.forEach(function(player) {
          var notify = {
            type: 'game_action',
            game_id: this.shared.game_id,
            user: player,
            access: [player],
            action_type: 'priest_save',
            done: false,
            issued: new Date(),
            seq_no: seq_no
          };
          if (player == action.user) notify.data = {
            by_user: true,
            saved: action.selection
          };
          this.add(notify);
        }, this);
        this.event('shared', { action: 'priest_save' });
        this.event('user/' + action.user, {
          action: 'priest_save',
          subject: [action.user],
          object: [action.selection]
        });
      }
    }, this);
  }
    
  // Handle seer pick
  var seerPick = this.actionsReady('seer_pick', seq_no - 1);
  if (seerPick) {
    seerPick.forEach(function(action) {
      action._deleted = true;

      var roles = this.roles(action.selection);
      var about = this.user[action.user].about;
      if (!about[action.selection])
        about[action.selection] = { tags: [] };
      var tags = about[action.selection].tags;
      roles.forEach(function(role) {
        if (tags.indexOf(role) == -1) tags.push(role);
      });
        
      this.add({
        type: 'game_action',
        game_id: this.shared.game_id,
        user: action.user,
        access: [action.user],
        action_type: 'seeing',
        data: {
          seen: action.selection,
          roles: roles
        },
        done: false,
        issued: new Date(),
        seq_no: seq_no
      });
      this.event('shared', { action: 'see' });
      this.event('user/' + action.user, {
        action: 'see',
        subject: [action.user],
        object: [action.selection],
        data: {
          roles: roles
        }
      });
    }, this);
  }
    
  // Handle election
  var election = this.actionsReady('election', seq_no - 1);
  if (election) {
    var votes = {};
    election.forEach(function(action) {
      action._deleted = true;
      if (!votes[action.vote]) votes[action.vote] = [];
      votes[action.vote].push(action.user);
    });
      
    var max = 0;
    var candidates = [];
    for (var player in votes) {
      if (votes[player].length == max) candidates.push(player);
      else if (votes[player].length > max) {
        candidates = [player];
        max = votes[player].length;
      }
    }
      
    if (candidates.length == 1) {
      this.shared.about[candidates[0]].tags.push('mayor');
      this.event('shared', {
        subject: [candidates[0]],
        action: 'become_mayor',
        data: { votes: votes }
      });
      this.players.alive.forEach(function(player) {
        this.add({
          type: 'game_action',
          game_id: game_id,
          user: player,
          access: this.players.alive,
          action_type: 'accept_mayor',
          done: false,
          issued: new Date(),
          seq_no: seq_no,
          data: {
            mayor: candidates[0]
          }
        });
        this.add({
          type: 'game_action',
          game_id: game_id,
          user: player,
          access: [player],
          action_type: 'hang_vote',
          vote: null,
          vote_type: 'mayor_decides',
          issued: new Date(),
          options: this.players.alive,
          seq_no: seq_no
        });
      }, this);
    } else {
      this.event('shared', {
        subject: this.players.alive,
        action: 'fail_to_elect',
        data: {
          votes: votes
        }
      });
      this.players.alive.forEach(function(player) {
        this.add({
          type: 'game_action',
          game_id: game_id,
          user: player,
          access: [player],
          action_type: 'election',
          vote: null,
          vote_type: 'majority',
          issued: new Date(),
          options: this.players.alive,
          seq_no: seq_no,
          data: {
            again: true,
            votes: votes
          }
        });
      }, this);
    }
    changeTime = false;
  }
    
  // Handle mayor pick
  var mayorPick = this.actionsReady('mayor_pick', seq_no - 1);
  if (mayorPick) mayorPick.forEach(function(action) {
    action._deleted = true;
    var execution = attack(action.selection, 'hanging').event('shared', {
      subject: this.players.alive.exceptFor(action.selection),
      action: 'hang',
      object: [action.selection],
      data: {
        votes: votes,
        mayor_decided: true
      }
    });
    this.players.alive.forEach(function(user) {
      if (user == action.selection) return;
      execution.action({
        user: user,
        access: this.players.alive,
        action_type: 'hanging',
        done: false,
        data: {
          hung: action.selection,
          roles: this.roles(action.selection),
          mayor_decided: true
        }
      });
    }, this);
    changeTime = false;
  }, this);
  
  // Handle hunting
  var hunting = this.actionsReady('hunter_pick', seq_no - 1);
  if (hunting) hunting.forEach(function(action) {
    action._deleted = true;
    
    // First kill the hunter
    var thisAttack = null;
    data.attacks.forEach(function(attack) {
      if (attack.player == action.user)
        thisAttack = attack;
    });
    if (thisAttack) {
      handleAttacks([thisAttack], true);
      attacks.splice(attacks.indexOf(thisAttack), 1);
    }
    
    // Then kill the victim
    var hunt = attack(action.selection, 'hunting').event('shared', {
      subject: [action.user],
      action: 'shoot',
      object: [action.selection]
    });
    this.players.alive.exceptFor(action.selection).forEach(function(user) {
      hunt.action({
        user: user,
        access: this.players.alive.exceptFor(action.selection),
        action_type: 'hunting',
        done: false,
        data: {
          hunter: action.user,
          hunted: action.selection,
          roles: this.roles(action.selection)
        }
      });
    }, this);
  }, this);
    
  // Handle mayor testament
  var testament = this.actionsReady('mayor_testament', seq_no - 1);
  if (testament) testament.forEach(function(action) {
    action._deleted = true;
    this.shared.about[action.user].tags.splice(this.shared.about[action.user].tags.indexOf('mayor'), 1);
    var thisAttack = null;
    data.attacks.forEach(function(attack) {
      if (attack.player == action.user)
        thisAttack = attack;
    });
    if (thisAttack) {
      handleAttacks([thisAttack], true);
      attacks.splice(attacks.indexOf(thisAttack), 1);
    }
    this.shared.about[action.selection].tags.push('mayor');
    this.event('shared', {
      subject: [action.selection],
      action: 'succeed',
      object: [action.user]
    });
    this.players.alive.exceptFor(action.user).forEach(function(player) {
      this.add({
        type: 'game_action',
        game_id: game_id,
        user: player,
        access: this.players.alive,
        action_type: 'mayor_succession',
        done: false,
        issued: new Date(),
        seq_no: seq_no,
        data: {
          mayor: action.selection,
          previous: action.user
        }
      });
    }, this);
    changeTime = false;
  }, this);
    
  // Handle hang vote
  var hangVote = this.actionsReady('hang_vote', seq_no - 1);
  if (hangVote) {
    var votes = {};
    hangVote.forEach(function(action) {
      action._deleted = true;
      if (!votes[action.vote]) votes[action.vote] = [];
      votes[action.vote].push(action.user);
    });
      
    var max = 0;
    var suspects = [];
    for (var player in votes) {
      if (votes[player].length == max) suspects.push(player);
      else if (votes[player].length > max) {
        suspects = [player];
        max = votes[player].length;
      }
    }

    var mayor = this.players.alive.mayor;
    var suspectMayor = suspects.indexOf(mayor);
    var chooseNonMayor = suspects.length == 2 && suspectMayor > -1;
    if (suspects.length == 1 || chooseNonMayor) {
      var hung = chooseNonMayor ? suspects[1 - suspectMayor] : suspects[0];
      var hang = attack(hung, 'hanging').event('shared', {
        subject: this.players.alive.exceptFor(hung),
        action: 'hang',
        object: [hung],
        data: {
          votes: votes
        }
      });
      this.players.alive.forEach(function(user) {
        if (user == hung) return;
        hang.action({
          user: user,
          access: this.players.alive,
          action_type: 'hanging',
          done: false,
          data: {
            hung: hung,
            roles: this.roles(hung)
          }
        });
      }, this);
    } else if (mayor) {
      this.add({
        type: 'game_action',
        game_id: game_id,
        user: mayor,
        access: this.players.alive,
        action_type: 'mayor_pick',
        selection: null,
        options: suspects,
        issued: new Date(),
        seq_no: seq_no,
        data: {
          votes: votes
        }
      });
      this.event('shared', {
        subject: this.players.alive,
        action: 'fail_to_hang_vote',
        data: {
          votes: votes
        }
      });
    } else {
      this.event('shared', {
        subject: this.players.alive,
        action: 'fail_to_hang_vote',
        data: {
          votes: votes
        }
      });
      this.players.alive.forEach(function(player) {
        this.add({
          type: 'game_action',
          game_id: game_id,
          user: player,
          access: [player],
          action_type: 'hang_vote',
          vote: null,
          vote_type: 'mayor_decides',
          issued: new Date(),
          options: this.players.alive,
          seq_no: seq_no,
          data: {
            again: true
          }
        });
      }, this);
    }
      
    changeTime = false;
  }
  
  // Handle all attacks that were not prevented    
  handleAttacks(attacks);

  if (finished(this)) {
    /*
    if (this.shared.ended.winner_description == 'werewolves')
      this.shared.time = 'night';
    else
    */
    this.shared.time = 'day';
    return;
  }

  if (changeTime) {
    if (this.shared.time == 'day') this.shared.time = 'night';
    else this.shared.time = 'day';

    if (this.shared.time == 'night') {
      // It becomes night

      var seer = this.players.alive.seer;
      if (seer) {
        var options = this.players.alive.exceptFor(seer);
        this.add({
          type: 'game_action',
          game_id: game_id,
          user: seer,
          access: [seer],
          action_type: 'seer_pick',
          issued: new Date(),
          selection: (options.length == 1) ? options.array[0] : null,
          options: options,
          seq_no: seq_no
        });
      }

      var priest = this.players.alive.priest;
      if (priest) {
        var options = this.players.alive.exceptFor(priest);
        this.add({
          type: 'game_action',
          game_id: game_id,
          user: priest,
          access: [priest],
          action_type: 'priest_pick',
          issued: new Date(),
          selection: (options.length == 1) ? options.array[0] : null,
          options: options,
          seq_no: seq_no
        });
      }

      var wolves = this.players.alive.werewolves;
      if (wolves.length) {
        var options = this.players.alive.nonWerewolves;
        wolves.forEach(function(wolf) {
          this.add({
            type: 'game_action',
            game_id: game_id,
            user: wolf,
            access: wolves,
            action_type: 'werewolf_vote',
            vote: (options.length == 1) ? options.array[0] : null,
            vote_type: 'unanimous',
            options: options,
            issued: new Date(),
            seq_no: seq_no
          });
        }, this);
      }
    } else {
      // It becomes day
        
      var alive = this.players.alive;

      if (alive.mayor) {
        alive.forEach(function(player) {
          this.add({
            type: 'game_action',
            game_id: game_id,
            user: player,
            access: [player],
            action_type: 'hang_vote',
            vote: null,
            vote_type: 'mayor_decides',
            issued: new Date(),
            options: alive,
            seq_no: seq_no
          });
        }, this);
      } else {
        alive.forEach(function(player) {
          this.add({
            type: 'game_action',
            game_id: game_id,
            user: player,
            access: [player],
            action_type: 'election',
            vote: null,
            vote_type: 'majority',
            issued: new Date(),
            options: alive,
            seq_no: seq_no
          });
        }, this);
      }
      
      //if (alive.)
    }
  }
};

if (typeof module !== 'undefined') module.exports = proceed;
if (typeof exports !== 'undefined') exports = proceed;

})();
