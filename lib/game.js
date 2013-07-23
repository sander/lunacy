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

// # lib/game.js
//
// Utility objects and functions for Lunacy games.

'use strict';

// ## Game
//
// The Game class makes it easy to work with Lunacy games.
//
// Call `new Game([doc1, doc2, …])` to get a Game instance based on an array of JSON docs. JSON docs are simple JavaScript `{ "key": "value" }` objects directly stored into our database.
//
// Docs are identified by their `game_id` and `type` fields. The type can be:
//
// - `game_shared_data`: data visible to all participants;
// - `game_hidden_data`: data only visible to Game Master and the dead;
// - `game_user_data`: data visible to a specific player, specified by the `user` field;
// - `game_action`: an action for a specific `user` to perform;
// - `game_chat`: a group chat message.
//
// Docs are made accessible to users through the `access` field, which is an array of user names.
function Game(docs) {
  this.set(docs);
};

// When creating new games, the default options are used if they are not specified.
Game.defaults = {
  n_vacancies: 7,
  name: 'Lunacity',
  n_werewolves: 2,
  has_seer: true,
  has_priest: true,
  has_hunter: true,
};
Game.names = 'Wolverooska,Howlington,Foghill,Slaughton,Mounthairy,Furroor,Wulkgrad,Clawbagh,Gloomycastle,Huntington,Lunafield,Holyboggan,Moonvin,Spiritvalley,Silvermore,Wolfhead,Crioddinas,Howling Forest,Wolfblood,Wolfup,Wolfenwald,Howling Hill,Snarlington,Wolfwood,Snaggletooth Spur,Feral Forest,Carnage Clearing,Butchery Bluff,Harm Hill,Vicious Vale,Ferocity,Guardsville,Hunter’s Hovel,Wilderwald,Battleburg,Terrorton,Horror Hights,Mt. Mystery,Jägersburg,Gory Green,Bêtebourg,Tanglethicket Town,Ghastly Green,Feralville,Goreville,Brutalburg,Hysteria Hovel,Mt. Murder,Anarchy Arbor'.split(',');

// ### Game.create()
//
// To create a game, call:
//
//     var myGame = Game.create("42", { n_players: 4 });
//
// This function creates the game docs and returns a Game.
Game.create = function create(id, opts) {
  // Create a shared doc, using the specified options or using the defaults. Three fields are particularly interesting:
  //
  // - `seq_no` counts the number of game rounds that have taken place. A round is defined by a group of `game_action` documents.
  // - `about` is an object containing player info, e.g. `about["Sander"] = { "tags": ["role/werewolf"] }`.
  // - `events` is an array of objects that look like this:
  //
  //       { "time": "2013-03-20T21:47:00.000Z",
  //         "subject": ["Simon", "weekendlover"],
  //         "action": "eat",
  //         "object": ["Sander"] }
  var shared = {
    type: 'game_shared_data',
    api_version: 2,
    game_id: id,
    seq_no: 0,
    time: 'day',
    access: [],
    invitees: [],
    about: {},
    n_vacancies: opts.n_players,
    open: opts.open,
    name: opts.name,
    n_werewolves: opts.n_werewolves,
    has_seer: opts.has_seer,
    has_priest: opts.has_priest,
    has_hunter: opts.has_hunter,
    events: []
  };
  for (var key in Game.defaults) if (shared[key] === undefined) shared[key] = Game.defaults[key];

  // Create the hidden doc. Most fields behave the same as in `shared`. The `seq_data` field contains hidden data relevant to this specific round. During the first round, this is an array containing all roles in a specific order: player `0` will receive role `hidden.seq_data.roles_to_divide[0]` etc.
  var hidden = {
    type: 'game_hidden_data',
    game_id: id,
    access: [],
    events: [],
    about: {},
    seq_no: 0,
    seq_data: {
      roles_to_divide: []
    }
  };

  // Create an array of cards based on the game options, without any particularly interesting order.
  var cards = [];
  for (var i = 0; i < shared.n_werewolves; i++) cards.push('werewolf');
  if (shared.has_seer) cards.push('seer');
  if (shared.has_priest) cards.push('priest');
  if (shared.has_hunter) cards.push('hunter');
  for (var i = cards.length; i < shared.n_vacancies; i++) cards.push('civilian');

  // Shuffle the cards by giving each a random index in `roles_to_divide`.
  for (var i = 0; i < shared.n_vacancies; i++) {
    var index = Math.floor(Math.random() * cards.length);
    hidden.seq_data.roles_to_divide.push(cards[index]);
    cards.splice(index, 1);
  }
  
  // Create a Game instance to make the rest of this function a bit easier.
  var game = new Game([shared, hidden]);
  
  // Add all players by looping through `opts.players`. Distinguish the founder and consider all other players as invited. We use the `Game.addPlayer()` and `Game.event()` methods described below.
  var added = [];
  opts.players.forEach(function(user) {
    if (user == opts.founder) {
      game.addPlayer(user, true);
      game.event('shared', {
        action: 'found',
        subject: [opts.founder]
      });
    } else {
      added.push(user);
      game.addPlayer(user, false);
    }
  });
  if (added.length) {
    game.event('shared', {
      action: 'add',
      subject: [opts.founder],
      object: added
    });
  }

  return game;
};

// All methods in `Game.prototype` are available to `Game` instances. Within these methods, `this` refers to the current `Game` instance. Some exampes to make clear how methods are called:
//
//     var game = new Game(docs);
//     game.process(doc); // calls the process() method
//     var id = game.id; // calls the get id() method
//     if (game.full) { console.log("too bad, we’re full!"); }
Game.prototype = {
  // ### Game.set()
  //
  // (Re)set the game docs. Initialise the game’s properties with empty values and call `Game.process()` for each.
  set: function set(docs) {
    this.docs = docs.filter(function(doc) { return !!doc; });
    this.shared = this.hidden = null;
    this.user = {};
    this.action = [];
    this.docs.forEach(this.process, this);
  },
  
  // ### Game.process()
  //
  // Put a new or updated doc in the right place. This checks for the doc type to put it in the right property. The `order` array is used to sort game actions.
  process: function process(doc) {
    var order = [
      'accept_role',
      'seeing',
      'accept_eaten',
      'hunting',
      'election',
      'accept_mayor',
      'hang_vote'
    ];
    switch (doc.type) {
      case 'game_shared_data': this.shared = doc; break;
      case 'game_hidden_data': this.hidden = doc; break;
      case 'game_user_data': this.user[doc.user] = doc; break;
      case 'game_action':
        var index = -1;
        this.action.forEach(function(action, i) {
          if (action._id == doc._id) index = i;
        });
        if (index != -1) this.action.splice(index, 1);
        if (!doc._deleted) this.action.push(new Action(doc));
        this.action.sort(function(a, b) {
          return order.indexOf(a.action_type) - order.indexOf(b.action_type);
        });
        break;
    }
  },
  
  // ### Game.add()
  //
  //  Add a doc to the game or update an existing doc, possibly deleting it.
  add: function add(doc) {
    for (var key in doc) {
      if (doc[key] && doc[key].toJSON)
        doc[key] = doc[key].toJSON();
    }
    var index = -1;
    this.docs.forEach(function(existing, i) {
      if (existing._id && existing._id == doc._id)
        index = i;
    }, this);
    if (index != -1) this.docs.splice(index, 1);
    if (!doc._deleted) {
      this.docs.push(doc);
      this.process(doc);
    }
  },
  
  // ### Game.id
  //
  // Unique identifier for the game, stored in all related docs.
  get id() {
    return this.shared.game_id;
  },
  
  // ### Game.full
  //
  // Boolean indicating whether there are vacancies or unanswered invitations.
  get full() {
    return !this.shared.n_vacancies && !this.shared.invitees.length;
  },
  
  // ### Game.ready
  //
  // Boolean indicating whether the game is running and has no open user actions or unresolved votings.
  get ready() {
    return !this.shared.ended && this.full && this.action.every(function(action) {
      return action.ready;
    }) && this.unanimousVotesReady;
  },
  
  // ### Game.ended
  //
  // Boolean indicating whether the game has ended.
  get ended() { return !!this.shared.ended; },
  
  // ### Game.unanimousVotesReady
  //
  // Boolean indicating whether all votings that should be unanimous are unanimous. Such votings are defined by `game_action` docs with a `vote_type: "unanimous"` field.
  get unanimousVotesReady() {
    var elections = {};
    var ready = true;
    this.action.forEach(function(action) {
      if (action.vote_type == 'unanimous') {
        if (!elections[action.action_type])
          elections[action.action_type] = action.vote;
        else if (elections[action.action_type] != action.vote)
          ready = false;
      }
    });
    return ready;
  },
  
  // ### Game.players
  get players() {
    return new PlayerList(this);
  },
  tags: function(player) {
    var tags = [];
    var check = [this.shared, this.hidden];
    this.players.forEach(function(player) {
      check.push(this.user[player]);
    }, this);
    check.forEach(function(source) {
      if (source) var about = source.about[player];
      if (about) about.tags.forEach(function(tag) {
        if (tags.indexOf(tag) == -1) tags.push(tag);
      });
    });
    return tags;
  },
  roles: function(player) {
    return this.tags(player).filter(function(tag) {
      return tag.indexOf('role/') == 0;
    });
  },
  actionsReady: function(type, seq_no) {
    var actions = this.action.filter(function(action) {
      return action.action_type == type && action.seq_no == seq_no;
    }, this);
    var ready = actions.every(function(action) {
      return action.ready;
    });
    if (actions.length && ready) return actions;
    else return null;
  },
  otherActions: function(type, user) {
    return this.action.filter(function(action) {
      return action.action_type == type && action.user != user;
    }, this);
  },
  event: function(to, event) {
    event.time = event.time || new Date();
    for (var key in event) {
      if (event[key] && event[key].toJSON)
        event[key] = event[key].toJSON();
    }
    switch (to) {
      case 'shared': this.shared.events.push(event); break;
      case 'hidden': this.hidden.events.push(event); break;
      default:
        var split = to.split('/');
        if (split[0] == 'user')
          this.user[split[1]].events.push(event);
        break;
    }
  },
  addPlayer: function(user, definitive) {
    var role = this.hidden.seq_data.roles_to_divide.pop();
    this.shared.n_vacancies--;
    this.shared.about[user] = {
      tags: []
    };
    this.shared.access.push(user);
    if (!definitive) this.shared.invitees.push(user);

    var data = {
      type: 'game_user_data',
      game_id: this.shared.game_id,
      user: user,
      access: [user],
      about: {},
      events: []
    };
    data.about[user] = { tags: ['role/' + role] };
    this.add(data);
    this.add({
      type: 'game_action',
      game_id: this.shared.game_id,
      user: user,
      access: [user],
      action_type: 'accept_role',
      done: false,
      issued: new Date().toJSON(),
      seq_no: 0
    });
    
    if (role == 'werewolf') this.showWerewolves();
    
    if (this.shared.events.map(function(event) { if (event.action == 'found') return event.subject[0]; }).indexOf(user) == -1)
      this.event('shared', {
        subject: [user],
        action: 'join'
      });
  },
  showWerewolves: function() {
    this.players.werewolves.forEach(function(player) {
      this.players.werewolves.forEach(function(werewolf) {
        if (!this.user[player].about[werewolf]) this.user[player].about[werewolf] = { tags: [] };
        var tags = this.user[player].about[werewolf].tags;
        if (tags.indexOf('role/werewolf') == -1) tags.push('role/werewolf');
      }, this);
    }, this);
  },
  next: function(player) {
    var actions = this.action.filter(function(action) {
      return action.user == player && !action.ready;
    });
    var votes = this.action.filter(function(action) {
      return action.user == player && action.method == 'vote';
    });
    var selections = this.action.filter(function(action) {
      return action.user == player && action.method == 'selection';
    });
    return actions[0] || votes[0] || selections[0] || null;
  },
  kill: function(player) {
    this.shared.about[player].tags.push('dead');
    this.action.forEach(function(action) {
      if (action.user == player) this.cancel(action);
    }, this);
    this.hidden.access.push(player);
    for (var name in this.user) {
      if (this.user[name].access.indexOf(player) == -1)
        this.user[name].access.push(player);
    }
  },
  cancel: function(action) {
    // TODO
  },
  toJSON: function() {
    return this.docs;
  }
};

function Action(doc) {
  this.doc = doc;
}
Game.Action = Action;

Action.prototype = {
  toJSON: function() { return this.doc; },
  set selection(selection) { this.doc.selection = selection; },
  set vote(vote) { this.doc.vote = vote; },
  set done(done) { this.doc.done = done; },
  set updated(updated) { this.doc.updated = updated; },
  set _deleted(deleted) { this.doc._deleted = deleted; },
  get options() { return this.doc.options; },
  get user() { return this.doc.user; },
  get action_type() { return this.doc.action_type; },
  get access() { return this.doc.access; },
  get selection() { return this.doc.selection; },
  get vote() { return this.doc.vote; },
  get done() { return this.doc.done; },
  get data() { return this.doc.data; },
  get vote_type() { return this.doc.vote_type; },
  get _id() { return this.doc._id; },
  get seq_no() { return this.doc.seq_no; },
  get updated() { return this.doc.updated; },
  get issued() { return this.doc.issued; },
  get ready() {
    if (this.doc.done !== undefined) return this.doc.done;
    else if (this.doc.vote !== undefined) return !!this.doc.vote;
    else if (this.doc.selection !== undefined) return !!this.doc.selection;
    else return false;
  },
  get method() {
    if (this.doc.done !== undefined) return 'done';
    else if (this.doc.vote !== undefined) return 'vote';
    else if (this.doc.selection !== undefined) return 'selection';
  }
};

function PlayerList(game, subset) {
  this.game = game;
  
  if (subset) this.array = subset;
  else this.array = Object.keys(this.game.shared.about);
  
  var keys = Object.keys(game.user);
  if (keys.length && game.user[keys[0]].order) {
    var order = game.user[keys[0]].order;
    this.array.sort(function(a, b) {
      if (order.indexOf(a) < order.indexOf(b)) return -1;
      else return 1;
    });
  }
}

PlayerList.prototype = {
  get length() {
    return this.array.length;
  },
  forEach: function forEach(cb, self) {
    this.array.forEach(cb, self);
  },
  check: function(tag, positive) {
    return function(player) {
      return (this.game.tags(player).indexOf(tag) != -1) == positive;
    }
  },
  filter: function(cb, self, singular) {
    var list = new PlayerList(this.game, this.array.filter(cb, self));
    if (singular)
      return list.length ? list.array[0] : null;
    else
      return list;
  },
  toJSON: function() {
    return this.array;
  },
  get alive() {
    return this.filter(this.check('dead', false), this);
  },
  get dead() {
    return this.filter(this.check('dead', true), this);
  },
  get seer() {
    return this.filter(this.check('role/seer', true), this, true);
  },
  get priest() {
    return this.filter(this.check('role/priest', true), this, true);
  },
  get hunter() {
    return this.filter(this.check('role/hunter', true), this, true);
  },
  get werewolves() {
    return this.filter(this.check('role/werewolf', true), this);
  },
  get nonWerewolves() {
    return this.filter(this.check('role/werewolf', false), this);
  },
  get mayor() {
    return this.filter(this.check('mayor', true), this, true);
  },
  exceptFor: function(exception) {
    return this.filter(function(player) {
      return player != exception;
    });
  },
  contains: function(player) {
    return this.array.indexOf(player) != -1;
  }
};

if (typeof module !== 'undefined') module.exports = Game;
if (typeof exports !== 'undefined') exports = Game;
