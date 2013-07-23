/*
 * angular-mobile-nav by Andy Joslin
 * http://github.com/ajoslin/angular-mobile-nav
 * @license MIT License http://goo.gl/Z8Nlo
 */

angular.module('mobile-navigate', []);
/* 
 * $change
 * Service to transition between two elements 
 */
angular.module('mobile-navigate').factory('$change', ['$q', '$rootScope', function($q, $rootScope) {
  var transitionPresets = {  //[nextClass, prevClass]
    //Modal: new page pops up, old page sits there until new page is over it
    'modal': ['modal', ''],
    'fade': ['fade', ''],
    'none': ['', '']
  }, defaultOptions = {
      'prefix': 'mb-'
  }, IN_CLASS = "in",
    OUT_CLASS = "out", 
    REVERSE_CLASS = "reverse",
    DONE_CLASS = "done",
    ANIMATION_END = "webkitAnimationEnd";

  return function change(next, prev, transType, reverse, options) {
    options = angular.extend(options || {}, defaultOptions);
    var deferred = $q.defer(),
      nextTransClass, prevTransClass;

    //buildClassString
    //Transforms array of classes into prefixed class string
    //(better for performance than multiple .addClass()
    //@param classes: Array{string}
    //@return string classNames
    function buildClassString(classes) {
      return classes.reduce(function(accumulator, cls) {
        return accumulator + (cls ? (' ' + options.prefix + cls) : '');
      }, '');
    }

    //Convert a preset (eg 'modal') to its array of preset classes if it exists
    //else, just convert eg 'slide' to ['slide', 'slide'], so both elements get it
    //The array layout is [nextinationClass, prevClass]
    var transition = transitionPresets[transType] ?
      transitionPresets[transType] : 
      [transType, transType];

    //Hack for white flash: z-index stops flash, offsetWidth thing forces z-index to apply
    next.css('z-index','-100');
    next[0].offsetWidth += 0;

    var nextClasses = buildClassString([
      reverse ? OUT_CLASS : IN_CLASS,
      (nextTransClass = transition[reverse ? 1 : 0]),
      reverse && REVERSE_CLASS || ''
    ]);
    next.addClass(nextClasses);

    var prevClasses;
    if (prev) {
      prevClasses = buildClassString([
       reverse ? IN_CLASS : OUT_CLASS,
       (prevTransClass = transition[reverse ? 0 : 1]),
       reverse && REVERSE_CLASS || ''
      ]);
      prev.addClass(prevClasses);
    }

    next.css('z-index', '');
    next[0].offsetWidth += 0;

    function done() {
      $rootScope.$apply(function() {
        deferred.resolve();
      });
    }

    //Find which element (sometimes none) to bind for ending
    var boundElement;
    if (nextTransClass && nextTransClass.length) {
      (boundElement = next).bind(ANIMATION_END, done);
    } else if (prev && prevTransClass && prevTransClass.length) {
      (boundElement = prev).bind(ANIMATION_END, done);
    } else {
      deferred.resolve();
    }

    deferred.promise.then(function() {
      boundElement && boundElement.unbind(ANIMATION_END, done);
      next.removeClass(nextClasses);
      prev && prev.removeClass(prevClasses);
    });

    //Let the user of change 'cancel' to finish transition early if they wish
    deferred.promise.cancel = function() {
      deferred.resolve();
    };
    return deferred.promise;
  };
}]);
angular.module('mobile-navigate').service('$navigate', ['$rootScope', '$location', '$route',
function($rootScope, $location, $route) {
  var self = this,
    navHistory = []; //we keep our own version of history and ignore window.history

  function Page(path, transition, isReverse) {
    var _path = path,
      _transition = transition || 'slide',
      _isReverse = isReverse,
      _onceTransition;

    this.transition = function() {
      var trans;
      if (_onceTransition) {
        trans = _onceTransition;
        _onceTransition = null;
      } else {
        trans = _transition;
      }
      return trans;
    };
    this.path = function() { return _path; };
    this.reverse = function() { return _isReverse; };

    //For setting a transition on a page - but only one time
    //Eg say on startup, we want to transition in with 'none',
    //but want to be 'slide' after that
    this.transitionOnce = function(trans) {
      _onceTransition = trans;
    };
  }
  
  function navigate(destination, source, isBack) {
    $rootScope.$broadcast('$pageTransitionStart', destination, source, isBack);
    self.current = self.next;
  }

  /* 
   * Will listen for a route change success and call the selected callback
   * Only one listen is ever active, so if you press for example 
   * /link1 then press back before /link1 is done, it will go listen for the back
   */
  self.onRouteSuccess = null;
  //Add a default onroutesuccess for the very first page
  function defaultRouteSuccess($event, next, last) {
    self.current && navHistory.push(self.current);
    self.next = new Page($location.path());
    self.next.transitionOnce('none');
    navigate(self.next);
    self.onRouteSuccess = null;
  }
  $rootScope.$on('$routeChangeSuccess', function($event, next, last) {
    // Only navigate if it's a valid route and it's not gonna just redirect immediately
    if (next.$route && !next.$route.redirectTo) { 
      (self.onRouteSuccess || defaultRouteSuccess)($event, next, last);
    }
  });

  /*
   * go -transitions to new page
   * @param path - new path
   * @param {optional} String transition
   * @param {optional} boolean isReverse, default false
   */
  self.go = function go(path, transition, isReverse) {
    if (typeof transition == 'boolean') {
      isReverse = transition;
      transition = null;
    }
    $location.path(path);
    //Wait for successful route change before actually doing stuff
    self.onRouteSuccess = function($event, next, last) {
      self.current && navHistory.push(self.current);
      self.next = new Page(path, transition || next.$route.transition, isReverse);
      navigate(self.next, self.current, false);
    };
  };
  //Sometimes you want to erase history
  self.eraseHistory = function() {
    navHistory.length = 0;
  };
  self.back = function() {
    if (navHistory.length > 0) {
      var previous = navHistory[navHistory.length-1];
      $location.path(previous.path());
      self.onRouteSuccess = function() {
        navHistory.pop();
        self.next = previous;
        navigate(self.next, self.current, true);
      };
      return true;
    }
    return false;
  };

  //Android back button functionality for phonegap
  if ((window.cordova || window.phonegap) && window.device && 
    device.platform && device.platform.toLowerCase() == "android") {
    document.addEventListener("deviceready", function() {
      document.addEventListener("backbutton", function() {
        var backSuccess = self.back();
        if (!backSuccess) {
          navigator.app.exitApp();
        }
      });
    });
  }
}]);
angular.module('mobile-navigate').directive('mobileView', ['$rootScope', '$compile', '$controller', '$route', '$change',
function($rootScope, $compile, $controller, $route, $change) {

  function link(scope, viewElement, attrs) {    
    //Insert page into dom
    function insertPage(page) {
      var current = $route.current, 
      locals = current && current.locals;

      page.element = angular.element(document.createElement("div"));
      page.element.html(locals.$template);
      page.element.addClass('mb-page'); //always has to have page class
      page.scope = scope.$new();
      if (current.controller) {
        locals.$scope = page.scope;
        page.controller = $controller(current.controller, locals);
        page.element.contents().data('$ngControllerController', page.controller);
      }
      $compile(page.element.contents())(page.scope);
      viewElement.append(page.element);
      page.scope.$emit('$viewContentLoaded');
      page.scope.$eval(attrs.onLoad);
    }

    var currentTrans;
    scope.$on('$pageTransitionStart', function transitionStart($event, dest, source, reverse) {
      function changePage() {
        insertPage(dest);
        var transition = reverse ? source.transition() : dest.transition();
        //If the page is marked as reverse, reverse the direction (lol)
        if (dest.reverse() || ($route.current && $route.current.$route.reverse)) {
          reverse = !reverse;
        }
        var promise = $change(dest.element, (source ? source.element : null),
          transition, reverse);

        promise.then(function() {
          if (source) {
            $rootScope.$broadcast('$pageTransitionSuccess', dest, source);
            source.scope.$destroy();
            source.element.remove();
            source = undefined;
          }
        });

        return promise;
      }
      currentTrans && currentTrans.cancel();
      currentTrans = changePage(dest, source, reverse);
    });
  }
  return {
    restrict: 'EA',
    link: link
  };
}]);
