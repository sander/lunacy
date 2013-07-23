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

angular.module('lunacy.configServices', []).
  constant('server', 'http://playlunacy.com:5986').
  constant('host', 'http://playlunacy.com:7000').
  constant('gamemaster', 'http://playlunacy.com:7003').
  constant('bouncer', 'http://playlunacy.com:7004').
  constant('dev', false);
