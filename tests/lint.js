'use strict';

const lint  = require('mocha-eslint');

lint([
  'src/**/*.js',
  'tests/**/*.js'
]);
