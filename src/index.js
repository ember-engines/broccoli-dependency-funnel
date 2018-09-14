'use strict';

const fs = require('fs');
const path = require('path-posix');
const Plugin = require('broccoli-plugin');
const FSTree = require('fs-tree-diff');
const Entry = require('fs-tree-diff/lib/entry');
const heimdall = require('heimdalljs');
const _logger = require('heimdalljs-logger');
const rimraf = require('rimraf');
const mrDepWalk = require('mr-dep-walk');
const copyFile = require('./utils/copy-file');
const existsStat = require('./utils/exists-stat');
const filterDirectory = require('./utils/filter-directory');

const logger = _logger('broccoli-dependency-funnel');

function BroccoliDependencyFunnelSchema() {
  this.cacheHit = 0;
  this.patchApplied = 0;
  this.noEntry = 0;
  this.copyAll = 0;
  this.mrDepWalk = 0;
}

module.exports = class BroccoliDependencyFunnel extends Plugin {
  constructor(node, _options) {
    let options = _options || {};
    super([node], {
      name: options.name,
      annotation: options.annotation,
      persistentOutput: true,
      needsCache: false
    });

    if (!(options.include ^ options.exclude)) {
      throw new Error('Must specify exactly one of `include` or `exclude`.');
    }

    // We only need 'include', because we know that if we're not including,
    // we're excluding.
    this.include = !!options.include;

    this.entry = options.entry;
    this.external = options.external;

    // An array and FSTree, respectively, representing the dependency graph of the
    // entry point or the non-dependency graph.
    this._depGraph = undefined;
    this._depGraphTree = undefined;
    this._nonDepGraph = undefined;
    this._nonDepGraphTree = undefined;
  }

  nextNonDepGraph() {
    return filterDirectory(this.inputPaths[0], '', module => this._depGraph.indexOf(module) === -1).sort();
  }

  build() {
    let node = heimdall.start({
      name: 'BroccoliDependencyFunnel (Build)',
      broccoliDependencyFunnel: true
    }, BroccoliDependencyFunnelSchema);
    let stats = node.stats;
    let inputPath = this.inputPaths[0];
    let nextNonDepGraph;

    // Check for changes in the files included in the dependency graph
    if (this._depGraph) {
      let incomingDepGraphTree = this._getFSTree(this._depGraph);
      let depGraphPatch = this._depGraphTree.calculatePatch(incomingDepGraphTree);
      let hasDepGraphChanges = depGraphPatch.length !== 0;

      if (!hasDepGraphChanges) {
        nextNonDepGraph = this.nextNonDepGraph();
        let incomingNonDepGraphTree = this._getFSTree(nextNonDepGraph);

        let nonDepGraphPatch = this._nonDepGraphTree.calculatePatch(incomingNonDepGraphTree);
        this._nonDepGraphTree = incomingNonDepGraphTree;
        this._nonDepGraph = nextNonDepGraph;
        let hasNonDepGraphChanges = nonDepGraphPatch.length !== 0;

        if (!hasNonDepGraphChanges) {
          stats.cacheHit++;
          logger.debug('cache hit, no changes');
          node.stop();
          return;
        } else if (this.include) {
          stats.cacheHit++;
          logger.debug('cache hit, no changes in dependency graph');
          node.stop();
          return;
        } else {
          stats.patchApplied++;
          logger.debug('applying patch', nonDepGraphPatch);
          FSTree.applyPatch(inputPath, this.outputPath, nonDepGraphPatch);
          node.stop();
          return;
        }
      }
    }

    let modules = [];

    let actualEntry = this.entry;
    let entryExists = fs.existsSync(path.join(inputPath, actualEntry));
    let usingModulesDir = false;

    // Ember-CLI might have all the modules inside a 'modules/' sub directory
    // so we check that as well
    if (!entryExists) {
      actualEntry = path.join('modules', this.entry);
      entryExists = fs.existsSync(path.join(inputPath, actualEntry));
      usingModulesDir = true;
    }

    if (!entryExists) {
      stats.noEntry++;
      logger.debug('entry did not exist');

      if (!this.include) {
        stats.copyAll++;
        logger.debug('copying all modules');

        // TODO: We should just symlink to the inputPath to the outputPath
        modules = fs.readdirSync(inputPath);
        this.copy(modules);
      }

      node.stop();
      return;
    }

    let mrDepWalkNode = heimdall.start({
      name: 'BroccoliDependencyFunnel (Mr Dep Walk)'
    });

    modules = mrDepWalk.depFilesFromFile(inputPath, {
      entry: this.entry,
      external: this.external || [],
      cwd: usingModulesDir ? 'modules' : ''
    });

    // Ensure `this.entry` is included in `modules`.
    //
    // `this.entry` will already be included if a member of its dependency
    // graph depends back on it. If none of its dependencies depend on it, it
    // will not be included.
    //
    if (modules.indexOf(actualEntry) === -1) {
      modules.unshift(actualEntry);
    }
    mrDepWalkNode.stop();
    stats.mrDepWalk++;
    logger.debug('Mr DepWalk executed');

    this._depGraph = modules.sort();
    this._nonDepGraph = nextNonDepGraph || this.nextNonDepGraph();

    rimraf.sync(this.outputPath);

    let toCopy = this.include ? this._depGraph : this._nonDepGraph;

    // TODO: should be patch based
    this.copy(toCopy);

    this._depGraphTree = this._getFSTree(this._depGraph);
    this._nonDepGraphTree = this._getFSTree(this._nonDepGraph);

    node.stop();
  }

  copy(inodes) {
    let inputPath = this.inputPaths[0];
    let outputPath = this.outputPath;

    for (let i = 0; i < inodes.length; i++) {
      let module = inodes[i];
      copyFile(path.join(inputPath, module), path.join(outputPath, module));
    }
  }

  /**
   * Constructs an FSTree from the passed in paths.
   *
   * @param {Array<String>} paths
   * @return {FSTree}
   */
  _getFSTree(paths) {
    let inputPath = this.inputPaths[0];
    let entries = paths.map(entryPath => {
      let absolutePath = path.join(inputPath, entryPath);
      let stat = existsStat(absolutePath);

      if (stat === null) {
        return;
      }

      return Entry.fromStat(entryPath, stat);
    }).filter(Boolean);

    return FSTree.fromEntries(entries);
  }
};
