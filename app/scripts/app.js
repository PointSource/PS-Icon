'use strict';

angular.module('psiconApp', [])
  .config(function ($routeProvider, $compileProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.html',
        controller: 'MainCtrl'
      })
      .otherwise({
        redirectTo: '/'
      });
      
    //Allows for links to exist with the follow protocols prefixes
    $compileProvider.urlSanitizationWhitelist(/^\s*(https?|ftp|filesystem|mailto|chrome-extension):/);
  });
