//
//  LuViewController.m
//  Lunacy
//
//  Created by Sander Dijkhuis on 20-09-12.
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


#import "AppDelegate.h"
#import "DataManager.h"
#import "ViewController.h"
#import "WebViewJavascriptBridge.h"

@interface ViewController ()
- (void)receiveDataChangeNotification:(NSNotification*)notification;
@end

@implementation ViewController

- (void)viewDidLoad
{
    [super viewDidLoad];
    
    self.webView = [self.webView init];

    [[NSHTTPCookieStorage sharedHTTPCookieStorage] setCookieAcceptPolicy:NSHTTPCookieAcceptPolicyAlways];
    
    self.webView.scrollView.bounces = NO;
    
    //[WebViewJavascriptBridge enableLogging];
    
    self.bridge = [WebViewJavascriptBridge bridgeForWebView:self.webView handler:^(id data, WVJBResponseCallback responseCallback) { }];
    
    [self.bridge registerHandler:@"startStorage" handler:^(id data, WVJBResponseCallback responseCallback) {
        NSDictionary *details = data;
        NSString *remote = [details objectForKey:@"remote"];
        NSString *local = [details objectForKey:@"local"];
        
        NSLog(@"Starting storage %@ <> %@", remote, local);
        
        DataManager *manager = [(AppDelegate *)[[UIApplication sharedApplication] delegate] dataManager];
        [manager startForRemote:remote local:local];
        responseCallback(@"started");
    }];
    
    [self.bridge registerHandler:@"stopStorage" handler:^(id data, WVJBResponseCallback responseCallback) {
        DataManager *manager = [(AppDelegate *)[[UIApplication sharedApplication] delegate] dataManager];
        [manager stop];
        NSLog(@"Stopping storage");
        responseCallback(@"stopped");
    }];
    
    [self.bridge registerHandler:@"openExternal" handler:^(id data, WVJBResponseCallback responseCallback) {
        [[UIApplication sharedApplication] openURL:[NSURL URLWithString:data]];
    }];
    
    [self.bridge registerHandler:@"queryView" handler:^(id data, WVJBResponseCallback responseCallback) {
        DataManager *manager = [(AppDelegate *)[[UIApplication sharedApplication] delegate] dataManager];
        NSDictionary *details = data;
        NSDictionary *result = [manager queryForDesign:data[@"design"] view:details[@"view"] params:details[@"params"]];
        responseCallback(result);
    }];
    
    [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL fileURLWithPath:[[NSBundle mainBundle] pathForResource:@"index.ios" ofType:@"html" inDirectory:@"html"]]]];
    /*
    [self.bridge send:@"Well hello there"];
    [self.bridge send:[NSDictionary dictionaryWithObject:@"Foo" forKey:@"Bar"]];
    [self.bridge send:@"Give me a response, will you?" responseCallback:^(id responseData) {
        NSLog(@"ObjC got its response! %@", responseData);
    }];
     */
    
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(receiveDataChangeNotification:) name:@"LunacyDataChange" object:nil];
}

- (void)didReceiveMemoryWarning
{
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

- (void)viewDidUnload {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    [self setWebView:nil];
    [self setBridge:nil];
    [super viewDidUnload];
}

- (void)receiveDataChangeNotification:(NSNotification *)notification {
    [self.bridge callHandler:@"change" data:[notification userInfo]];
}
@end
