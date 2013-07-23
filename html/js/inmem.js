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


window.query = function(db, view, params) {
  var req = view.split('/');
  var mapreduce = window.ddocs[req[0]].views[req[1]];
  var rows = [];
  for (var id in db) {
    var doc = db[id];
    window.emit = function(key, value) {
      var row = {
        key: key,
        value: value
      };
      if (params.include_docs) row.doc = doc;
      if (!doc._deleted) rows.push(row);
    };
    mapreduce.map(doc);
  }
  if (params.reduce && params.group) {
    var groups = [];
    var prev = null;
    var group = null;
    rows.forEach(function(row, i) {
      if (prev != row.key || !group) {
        group = [];
        groups.push(group);
        prev = row.key;
      }
      group.push(i);
    });
    var reduced = [];
    groups.forEach(function(group) {
      var sub = rows.filter(function(row, i) { return group.indexOf(i) > -1 });
      reduced.push({
        key: sub[0].key,
        value: mapreduce.reduce(
          sub.map(function(row) { return row.key; }),
          sub.map(function(row) { return row.value; }),
          false
        )
      });
    });
    rows = reduced;
  }
  if (params.key) return { rows: rows.filter(function(row) { return row.key == params.key; }) };
  else return { rows: rows };
};
