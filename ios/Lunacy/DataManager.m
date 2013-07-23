//
//  LuDataManager.m
//  Lunacy
//
//  Created by Sander Dijkhuis on 07-10-12.
//
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


#import <CouchCocoa/CouchCocoa.h>
#import <CouchCocoa/CouchDesignDocument_Embedded.h>
#import <TouchDB/TouchDB.h>
#import <TouchDB/TD_Server.h>
#import <TouchDBListener/TDListener.h>

#import "AppDelegate.h"
#import "DataManager.h"

#define kPortNumber 59840

@interface DataManager()
- (void)defineUserViews:(CouchDesignDocument *)design;
- (void)defineGeneralViews:(CouchDesignDocument *)design;
@end

@implementation DataManager
{
    CouchDatabase *_db;
    CouchPersistentReplication *_pull;
    CouchPersistentReplication *_push;
    CouchLiveQuery *_live;
    UInt64 lastSeq;
}

- (void)startForRemote:(NSString *)remote local:(NSString *)local {
    CouchTouchDBServer *server = [CouchTouchDBServer sharedInstance];
    
    if (server.error)
        NSLog(@"%@ Error making server: %@", [self class], [server.error localizedDescription]);
    
    //gRESTLogLevel = kRESTLogRequestURLs;
    
    // Listen to HTTP requests
    [server tellTDServer:^(TD_Server *tds) {
        TDListener *listener = [[TDListener alloc] initWithTDServer:tds port:kPortNumber];
        [listener start];
        dispatch_async(dispatch_get_main_queue(), ^ {
            // do stuff with listener port
        });
    }];
    
    _db = [server databaseNamed:local];
    [_db create];
    
    // Set up design docs
    CouchDesignDocument* generalDesign = [_db designDocumentWithName:@"general"];
    [self defineGeneralViews:generalDesign];
    CouchDesignDocument* userDesign = [_db designDocumentWithName:@"user"];
    [self defineUserViews:userDesign];
    
    // Set up replication
    NSArray* repls = [_db replicateWithURL:[NSURL URLWithString:remote] exclusively:YES];
    _pull = [repls objectAtIndex:0];
    _pull.filter = @"user/no_design";
    _push = [repls objectAtIndex:1];
    [_pull addObserver:self forKeyPath:@"mode" options:0 context:NULL];
    [_push addObserver:self forKeyPath:@"mode" options:0 context:NULL];
    
    // Get updates for all docs
    CouchQuery *query = [_db getAllDocuments];

    _live = [query asLiveQuery];
    _live.prefetch = YES;
    _live.sequences = YES;
    [_live start];
    [_live wait];
    [_live addObserver:self forKeyPath:@"rows" options:0 context:NULL];
    
    lastSeq = [_db lastSequenceNumber];
}

- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    if (object == _pull || object == _push) {
        [[UIApplication sharedApplication] setNetworkActivityIndicatorVisible:(_pull.mode == kCouchReplicationActive || _push.mode == kCouchReplicationActive)];
    } else if (object == _live) {
        for (CouchQueryRow* row in [object rows]) {
            if (row.localSequence > lastSeq) {
                [[NSNotificationCenter defaultCenter] postNotificationName:@"LunacyDataChange" object:self userInfo:[[row document] properties]];
                lastSeq = row.localSequence;
            }
        }
    }
}

- (void)stop {
    CouchTouchDBServer *server = [CouchTouchDBServer sharedInstance];
    
    [server close];
}

- (NSMutableDictionary *)queryForDesign:(NSString *)design view:(NSString *)view params:(NSDictionary *)params {
    NSMutableArray *rows = [NSMutableArray new];
    NSMutableDictionary *output = [@{@"rows": rows} mutableCopy];
    
    CouchDesignDocument *ddoc = [_db designDocumentWithName:design];
    CouchQuery *query = [ddoc queryViewNamed:view];
    if (params[@"include_docs"]) query.prefetch = @YES;
    if (params[@"keys"]) query.keys = params[@"keys"];
    // We’re ignoring reduce.
    if (params[@"startkey"]) query.startKey = params[@"startkey"];
    if (params[@"endkey"]) query.endKey = params[@"endkey"];
    for (CouchQueryRow *row in query.rows) {
        if (query.prefetch) {
            if (row.value)
                [rows addObject:@{@"key": row.key, @"value": row.value, @"doc": row.documentProperties}];
            else
                [rows addObject:@{@"key": row.key, @"doc": row.documentProperties}];
        } else {
            if (row.value)
                [rows addObject:@{@"key": row.key, @"value": row.value}];
            else
                [rows addObject:@{@"key": row.key}];
        }
    }
    return output;
};

- (void)defineUserViews:(CouchDesignDocument *)design {
    [design defineViewNamed:@"history" mapBlock:MAPBLOCK({
        NSString *gameId = [doc objectForKey:@"game_id"];
        if (gameId) {
            NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
            formatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ssZZZ";
            if ([(NSString *)[doc objectForKey:@"type"] isEqualToString:@"game_chat"]) {
                NSTimeInterval timestamp = [[formatter dateFromString:[doc objectForKey:@"time"]] timeIntervalSince1970];
                emit([NSArray arrayWithObjects:gameId, timestamp * 1000, nil], doc);
            } else {
                NSArray *events = [doc objectForKey:@"events"];
                if (events) {
                    for (NSDictionary *event in events) {
                        NSTimeInterval timestamp = [[formatter dateFromString:[event objectForKey:@"time"]] timeIntervalSince1970];
                        emit([NSArray arrayWithObjects:gameId, timestamp * 1000, nil], event);
                    }
                }
            }
        }
    }) version:@"2.0.0"];
    
    [design defineViewNamed:@"friends" mapBlock:MAPBLOCK({
        if ([(NSString *)[doc objectForKey:@"type"] isEqualToString:@"friendship"]) {
            emit([NSArray arrayWithObjects:[doc objectForKey:@"user"], [doc objectForKey:@"friend"], nil], nil);
        }
    }) version:@"2.0.0"];
}

- (void)defineGeneralViews:(CouchDesignDocument *)design {
    [design defineViewNamed:@"game_info" mapBlock:MAPBLOCK({
        if (doc[@"game_id"] && ![doc[@"type"] isEqualToString:@"game_chat"]) {
            emit(doc[@"game_id"], nil);
        }
    }) version:@"2.0.0.5"];
    
    [design defineViewNamed:@"games" mapBlock:MAPBLOCK({
        id type = doc[@"type"];
        if ([type isEqualToString:@"game_shared_data"] || [type isEqualToString:@"game_hidden_data"] || [type isEqualToString:@"game_user_data"] || [type isEqualToString:@"game_action"] || [type isEqualToString:@"game_chat"]) {
            emit(doc[@"game_id"], doc);
        }
    }) reduceBlock:^id(NSArray* keys, NSArray* values, BOOL rereduce) {
        id details = [@{
                      @"action_needed": [NSMutableArray new],
                      @"open_actions": [NSMutableArray new],
                      @"ended": @NO,
                      @"open": @NO,
                      @"chat_info": [@{
                                     @"times": [NSMutableArray new],
                                     @"last_checks": [NSMutableDictionary new],
                                     @"new_messages": [NSMutableDictionary new]
                                     } mutableCopy],
                      @"last_update": @0
                      } mutableCopy];
        
        void (^updateNewMessages)(void) = ^(void) {
            if (details[@"players"]) {
                for (id player in details[@"players"]) {
                    id msgs = details[@"chat_info"][@"new_messages"];
                    id lastCheck = details[@"chat_info"][@"last_checks"][player];
                    if (!lastCheck) lastCheck = @0;
                    if (!msgs[player]) msgs[player] = @0;
                    int count = [msgs[player] intValue];
                    for (id time in details[@"chat_info"][@"times"]) {
                        if ([time compare:lastCheck] == NSOrderedDescending)
                            count++;
                    }
                    msgs[player] = [NSNumber numberWithInt:count];
                }
            }
        };
        
        if (rereduce) {
            for (NSDictionary *value in values) {
                for (id key in value.keyEnumerator) {
                    if (![key isEqualToString:@"action_needed"] && ![key isEqualToString:@"chat_info"] && ![key isEqualToString:@"last_update"] && value[key] != nil) {
                        details[key] = value[key];
                    }
                }
                
                if ([value[@"last_update"] compare:details[@"last_update"]] == NSOrderedDescending) {
                    details[@"last_update"] = value[@"last_update"];
                }
                
                for (id user in value[@"action_needed"]) {
                    if (![details[@"action_needed"] containsObject:user]) {
                        [details[@"action_needed"] addObject:user];
                    }
                }
                
                [details[@"chat_info"][@"times"] addObjectsFromArray:value[@"chat_info"][@"times"]];
                NSDictionary *lastChecks = value[@"chat_info"][@"last_checks"];
                for (id user in lastChecks.allKeys) {
                    details[@"last_checks"][user] = lastChecks[user];
                }
                
                updateNewMessages();
            }
            
            [details[@"chat_info"][@"times"] removeAllObjects];
        } else {
            if (values && values.count)
                details[@"id"] = values[0][@"game_id"];
            
            NSDateFormatter *formatter = [NSDateFormatter new];
            formatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSSZZZ";
            NSNumber *(^toTimeStamp)(NSString *) = ^(NSString *jsonFormat) {
                return [NSNumber numberWithDouble:([[formatter dateFromString:jsonFormat] timeIntervalSince1970] * 1000)];
            };
            
            for (id doc in values) {
                id type = doc[@"type"];
                if ([type isEqualToString:@"game_shared_data"]) {
                    details[@"name"] = doc[@"name"];
                    details[@"n_vacancies"] = doc[@"n_vacancies"];
                    details[@"open"] = doc[@"open"];
                    if (details[@"open"] == nil) details[@"open"] = @NO;
                    details[@"players"] = [doc[@"about"] allKeys];
                    if (doc[@"ended"]) details[@"ended"] = doc[@"ended"];
                    
                    id vLastEvent = toTimeStamp([doc[@"events"] lastObject][@"time"]);
                    if ([details[@"last_update"] compare:vLastEvent] == NSOrderedAscending) {
                        details[@"last_update"] = vLastEvent;
                    }
                } else if ([type isEqualToString:@"game_action"]) {
                    id updated;
                    updated = doc[@"updated"] ? toTimeStamp(doc[@"updated"]) : toTimeStamp(doc[@"issued"]);
                    if ([details[@"last_update"] compare:updated] == NSOrderedAscending) {
                        details[@"last_update"] = updated;
                    }
                    
                    if (([[doc allKeys] containsObject:@"done"] && ![doc[@"done"] boolValue]) ||
                        ([[doc allKeys] containsObject:@"vote"] && doc[@"vote"] == [NSNull null]) ||
                        ([[doc allKeys] containsObject:@"selection"] && doc[@"selection"] == [NSNull null])) {
                        [details[@"action_needed"] addObject:doc[@"user"]];
                    }
                } else if ([type isEqualToString:@"game_user_data"]) {
                    if (doc[@"last_check"]) {
                        details[@"chat_info"][@"last_checks"][doc[@"user"]] = toTimeStamp(doc[@"last_check"]);
                    }
                } else if ([type isEqualToString:@"game_chat"]) {
                    id time = toTimeStamp(doc[@"time"]);
                    [details[@"chat_info"][@"times"] addObject:time];
                    if ([details[@"last_update"] compare:time] == NSOrderedAscending) {
                        details[@"last_update"] = time;
                    }
                }
            }
        
            updateNewMessages();
        }
     
        return details;
    } version:@"2.0.0.25"];
    
    [design defineViewNamed:@"profiles" mapBlock:MAPBLOCK({
        if (doc[@"type"] && [doc[@"type"] isEqualToString:@"profile"]) {
            emit(doc[@"user"], nil);
        }
    }) version:@"2.0.0.2"];
}

@end
