'use strict';

const BroccoliDependencyFunnel = require('../');
const broccoli = require('broccoli');
const chai = require('chai');
const chaiFiles = require('chai-files');
const fixture = require('fixturify');
const fs = require('fs-extra');
const walkSync = require('walk-sync');
const path = require('path');
const co = require('co');

const expect = chai.expect;
const file = chaiFiles.file;

chai.config.truncateThreshold = 1000;
chai.use(chaiFiles);

// Some filesystems dont have lower then 1s mtime resolution
function fsTick() {
  return new Promise(resolve => setTimeout(resolve, 1001));
}

// Helper to assert that two stats are equal, but only in the ways we care about.
// Helpful because atime is finicky.
function assertStatEqual(a, b) {
  expect(a.mtime.toString()).to.equal(b.mtime.toString());
  expect(a.mode).to.equal(b.mode);
  expect(a.size).to.equal(b.size);
}

// Helper to assert that a file did change. We really only care that mtime changed.
function assertStatChange(a, b) {
  expect(a.mtime.toString()).to.not.equal(b.mtime.toString());
}

describe('BroccoliDependencyFunnel', function() {
  this.timeout(5000);

  const input = 'tmp/fixture-input';
  let node, pipeline;
  const FIXTURES = [
    {
      title: 'ES6',
      data: {
        'routes.js': `
          import buildRoutes from "ember-engines/routes";
          import foo from "utils/foo";
          import bar from "some-external/thing";
        `,
        'utils': {
          'foo.js': 'import derp from "./derp";export default {};',
          'derp.js': 'export default {};',
          'herp.js': 'export default {};'
        },
        'engine.js': 'import herp from "./utils/herp";'
      }
    },

    {
      title: 'ES5',
      data: {
        'routes.js': `define('routes', ["ember-engines/routes", "utils/foo", "some-external/thing" ], function() { });`,
        'utils': {
          'foo.js': `define('foo', ['./derp'], function() { });`,
          'derp.js': `define('derp', [], function() { });`,
          'herp.js': `define('herp', [], function() { });`
        },
        'engine.js': `define('engine', ['./utils/herp'], function() { });`
      }
    },

    {
      title: 'Modules',
      usingModulesDir: true,
      data: {
        'modules': {
          'routes.js': `
            import buildRoutes from "ember-engines/routes";
            import foo from "utils/foo";
            import bar from "some-external/thing";
          `,
          'utils': {
            'foo.js': 'import derp from "./derp";export default {};',
            'derp.js': 'export default {};',
            'herp.js': 'export default {};'
          },
          'engine.js': 'import herp from "./utils/herp";'
        }
      }
    }
  ];

  FIXTURES.forEach(FIXTURE => {
    describe(FIXTURE.title, function() {
      beforeEach(function() {
        fs.mkdirpSync(input);
        fixture.writeSync(input, FIXTURE.data);
      });

      afterEach(function() {
        fs.removeSync(input);
        return pipeline.cleanup();
      });

      describe("build", function() {
        it('returns a tree of the dependency graph when using include', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            include: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);

          const output = yield pipeline.build();
          let directory = output.directory;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          expect(walkSync(directory)).to.deep.equal([ 'routes.js', 'utils/', 'utils/derp.js', 'utils/foo.js']);
        }));

        it('returns a tree excluding the dependency graph when using exclude', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            exclude: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);

          const output = yield pipeline.build();
          let directory  = output.directory;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          expect(walkSync(directory)).to.deep.equal([ 'engine.js', 'utils/', 'utils/herp.js' ]);
        }));

        it('returns an empty tree when entry does not exist and using include', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            include: true,
            entry: 'does-not-exist.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);

          const output = yield pipeline.build();
          const directory = output.directory;

          expect(walkSync(directory)).to.deep.equal([]);
        }));

        it('returns the input tree when entry does not exist and using exclude', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            exclude: true,
            entry: 'does-not-exist.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);

          const output = yield pipeline.build();
          expect(walkSync(output.directory)).to.deep.equal(walkSync(input));
        }));
      });

      describe('rebuild', function() {
        it('is stable on unchanged rebuild with include', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            include: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);

          const output = yield pipeline.build();
          const directory = output.directory;

          const beforeStat = fs.statSync(directory);

          yield fsTick();
          yield pipeline.build();

          const afterStat = fs.statSync(directory);
          assertStatEqual(beforeStat, afterStat);
        }));

        it('is stable on unchanged rebuild with exclude', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            exclude: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);

          const output = yield pipeline.build();
          const directory = output.directory;

          const beforeStat = fs.statSync(directory);

          yield fsTick();
          yield pipeline.build();

          const afterStat = fs.statSync(directory);
          assertStatEqual(beforeStat, afterStat);
        }));

        it('is stable when changes occur outside dep graph and using include', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            include: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);
          const output = yield pipeline.build();
          const directory = output.directory;

          const beforeStat = fs.statSync(directory);
          yield fsTick();

          fixture.writeSync(input, {
            'engine.js': ''
          });

          yield pipeline.build();

          const afterStat = fs.statSync(directory);
          assertStatEqual(beforeStat, afterStat, 'stable rebuild when modifying file NOT in dep graph');
        }));

        it('updates when changes occur in dep graph and using include', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            include: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);
          const output = yield pipeline.build();
          let directory = output.directory;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          const beforeStat = fs.statSync(directory);

          expect(walkSync(directory)).to.deep.equal([ 'routes.js', 'utils/', 'utils/derp.js', 'utils/foo.js' ]);

          yield fsTick();

          let updateLocation = FIXTURE.usingModulesDir ? path.join(input, 'modules') : input;
          fixture.writeSync(updateLocation, {
            'routes.js': 'import herp from "utils/herp";'
          });

          yield pipeline.build();

          const afterStat = fs.statSync(directory);
          assertStatChange(beforeStat, afterStat, 'instable rebuild when modifying file in dep graph');

          expect(walkSync(directory)).to.deep.equal([ 'routes.js', 'utils/', 'utils/herp.js' ]);
        }));

        it('updates when changes occur outside dep graph and using exclude', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            exclude: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);

          let output = yield pipeline.build();
          let directory = output.directory;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          const engineStat = fs.statSync(directory + '/engine.js');
          const routesStat = fs.statSync(directory + '/utils/herp.js');

          yield fsTick();

          let updateLocation = FIXTURE.usingModulesDir ? path.join(input, 'modules') : input;
          fixture.writeSync(updateLocation, {
            'engine.js': ''
          });

          yield pipeline.build();

          const engineRebuildStat = fs.statSync(directory + '/engine.js');
          assertStatChange(engineStat, engineRebuildStat, 'engine.js changed');

          let routesRebuildStat = fs.statSync(directory + '/utils/herp.js');
          assertStatEqual(routesStat, routesRebuildStat, 'routes.js unchanged');

          yield fsTick();

          fs.unlinkSync(path.join(updateLocation, 'engine.js'));

          yield pipeline.build();

          expect(file(directory + '/engine.js')).to.not.exist;

          routesRebuildStat = fs.statSync(directory + '/utils/herp.js');
          assertStatEqual(routesStat, routesRebuildStat, 'routes.js unchanged second time');
        }));

        it('updates when changes occur in dep graph and using exclude', co.wrap(function* () {
          node = new BroccoliDependencyFunnel(input, {
            exclude: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          pipeline = new broccoli.Builder(node);
          const output = yield pipeline.build();
          let directory = output.directory;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          const buildStat = fs.statSync(directory);

          expect(walkSync(directory)).to.deep.equal([ 'engine.js', 'utils/', 'utils/herp.js' ]);

          yield fsTick();

          let updateLocation = FIXTURE.usingModulesDir ? path.join(input, 'modules') : input;
          fixture.writeSync(updateLocation, {
            'routes.js': 'import herp from "utils/herp";'
          });

          yield pipeline.build();

          const rebuildStat = fs.statSync(directory);
          assertStatChange(rebuildStat, buildStat, 'instable rebuild when modifying file in dep graph');

          expect(walkSync(directory)).to.deep.equal([ 'engine.js', 'utils/', 'utils/derp.js', 'utils/foo.js' ]);
        }));
      });
    });
  });
});
