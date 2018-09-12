# broccoli-dependency-funnel

[![Build Status](https://travis-ci.org/ember-engines/broccoli-dependency-funnel.svg?branch=master)](https://travis-ci.org/ember-engines/broccoli-dependency-funnel)
[![Build Status](https://ci.appveyor.com/api/projects/status/ilvo74csww13f3j3?svg=true)](https://ci.appveyor.com/project/embercli/broccoli-dependency-funnel)

This [Broccoli](https://github.com/broccolijs/broccoli) plugin funnels a set of files included (or excluded) from a JS dependency graph.

In other words, you specify an ES6 module as an entry point and the plugin will walk its import graph and only copy-forward the files included in the graph. Alternatively, you can copy forward all files except those in the graph.

## Usage

```js
const DependencyFunnel = require('broccoli-dependency-funnel');
const input = 'src'; // Can be a directory or Broccoli plugin/node

module.exports = new DependencyFunnel(input, {
  include: true,
  entry: 'app.js',
  external: [ 'lodash' ]
});
```

## Options

* `include` / `exclude`: you **must** specify _exactly one_ of these options set to `true`. This determines whether the files included in the dependency graph or the files excluded from the dependency graph will be funneled forward.

* `entry`: you **must** specify an entry point to the dependency graph you wish to funnel. This should be a string path relative the input directory/node.

* `external`: an **optional** array of imports to be treated as external, meaning they aren't present in the given input directory structure.

## Development

### Installation

* `git clone <repository-url>`
* `cd broccoli-dependency-funnel`
* `npm install`

### Testing

* `npm run test` or `npm run test:debug`
