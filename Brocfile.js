var babel = require('broccoli-babel-transpiler');
var merge = require('broccoli-merge-trees');
var mv = require('broccoli-stew').mv;
var lint = require('broccoli-lint-eslint');

module.exports = merge([
  mv(babel(lint('tests')), 'tests'),
  babel(lint('src')),
]);
