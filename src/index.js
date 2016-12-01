import fs from 'fs';
import path from 'path-posix';
import Plugin from 'broccoli-plugin';
import FSTree from 'fs-tree-diff';
import Entry from 'fs-tree-diff/lib/entry';
import existsSync from 'exists-sync';
import heimdall from 'heimdalljs'; // eslint-disable-line no-unused-vars
import { default as _logger } from 'heimdalljs-logger';
import rimraf from 'rimraf';
import { rollup } from 'rollup';
import { moduleResolve as amdNameResolver } from 'amd-name-resolver';

import copyFile from './utils/copy-file';
import existsStat from './utils/exists-stat';
import filterDirectory from './utils/filter-directory';

const logger = _logger('broccoli-dependency-funnel'); // eslint-disable-line no-unused-vars

export default class BroccoliDependencyFunnel extends Plugin {
  constructor(node, options = {}) {
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

  build() {
    let [inputPath] = this.inputPaths;

    // Check for changes in the files included in the dependency graph
    if (this._depGraph) {
      let incomingDepGraphTree = this._getFSTree(this._depGraph);
      let depGraphPatch = this._depGraphTree.calculatePatch(incomingDepGraphTree);
      let hasDepGraphChanges = depGraphPatch.length !== 0;

      if (!hasDepGraphChanges) {
        let incomingNonDepGraphTree = this._getFSTree(this._nonDepGraph);
        let nonDepGraphPatch = this._nonDepGraphTree.calculatePatch(incomingNonDepGraphTree);
        let hasNonDepGraphChanges = nonDepGraphPatch.length !== 0;

        if (!hasNonDepGraphChanges) {
          return;
        }

        if (this.include) {
          return;
        } else {
          FSTree.applyPatch(inputPath, this.outputPath, nonDepGraphPatch);
          return;
        }
      }
    }

    let modules = [];

    let entryExists = existsSync(path.join(inputPath, this.entry));
    if (!entryExists && this.include) {
      if (!this.include) {
        modules = fs.readdirSync(inputPath);
        this.copy(modules);
      }

      return;
    }

    let rollupOptions = {
      entry: this.entry,
      external: this.external || [],
      dest: 'foo.js',
      plugins: [
        {
          resolveId: function(importee, importer) {
            let moduleName;

            // This will only ever be the entry point.
            if (!importer) {
              moduleName = importee.replace(inputPath, '');
              modules.push(moduleName);
              return path.join(inputPath, importee);
            }

            // Link in the global paths.
            moduleName = amdNameResolver(importee, importer).replace(inputPath, '').replace(/^\//, '');
            let modulePath = path.join(inputPath, moduleName + '.js');
            if (existsSync(modulePath)) {
              modules.push(moduleName + '.js');
              return modulePath;
            }
          }
        }
      ]
    };

    return rollup(rollupOptions).then(() => {
      this._depGraph = modules.sort();
      this._nonDepGraph = filterDirectory(inputPath, '', function(module) {
        return modules.indexOf(module) === -1;
      }).sort();

      rimraf.sync(this.outputPath);

      let toCopy = this.include ? this._depGraph : this._nonDepGraph;

      this.copy(toCopy);

      this._depGraphTree = this._getFSTree(this._depGraph);
      this._nonDepGraphTree = this._getFSTree(this._nonDepGraph);

      return;
    });
  }

  copy(inodes) {
    const inputPath = this.inputPaths[0];
    const outputPath = this.outputPath;

    for (let i = 0; i < inodes.length; i++) {
      const module = inodes[i];
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
    let [inputPath] = this.inputPaths;
    let entries = paths.map((entryPath) => {
      let absolutePath = path.join(inputPath, entryPath);
      let stat = existsStat(absolutePath);

      if (!stat) {
        return;
      }

      return Entry.fromStat(entryPath, stat);
    }).filter(Boolean);

    return FSTree.fromEntries(entries);
  }
}
