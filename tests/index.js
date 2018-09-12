'use strict';

const BroccoliDependencyFunnel = require('../');
const chai = require('chai');
const chaiFiles = require('chai-files');
const fs = require('fs-extra');
const walkSync = require('walk-sync');
const path = require('path');
const co = require('co');

const helper = require("broccoli-test-helper");
const expect = require("chai").expect;
const createBuilder = helper.createBuilder;
const createTempDir = helper.createTempDir;

const file = chaiFiles.file;

chai.config.truncateThreshold = 1000;
chai.use(chaiFiles);

// Some filesystems dont have lower then 1s mtime resolution
function fsTick() {
  return new Promise(resolve => setTimeout(resolve, 1001));
}
// Helper to assert that two stats are equal, but only in the ways we care about. Helpful because atime is finicky.
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
      let input, output;

      beforeEach(co.wrap(function* () {
        input = yield createTempDir();
        input.write(FIXTURE.data);
      }));

      afterEach(function() {
        input.dispose();
        output.dispose();
      });

      describe("build", function() {
        it('returns a tree of the dependency graph when using include', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            include: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);

          yield output.build();

          let directory = output.dir;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          expect(walkSync(directory)).to.deep.equal([ 'routes.js', 'utils/', 'utils/derp.js', 'utils/foo.js']);
        }));

        it('returns a tree excluding the dependency graph when using exclude', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            exclude: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);

          yield output.build();

          let directory = output.dir;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          expect(walkSync(directory)).to.deep.equal([ 'engine.js', 'utils/', 'utils/herp.js' ]);
        }));

        it('returns an empty tree when entry does not exist and using include', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            include: true,
            entry: 'does-not-exist.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);

          yield output.build();

          expect(output.readDir()).to.deep.equal([]);
        }));

        it('returns the input tree when entry does not exist and using exclude', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            exclude: true,
            entry: 'does-not-exist.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);

          yield output.build();

          expect(output.readDir()).to.deep.equal(walkSync(input.path()));
        }));
      });

      describe('rebuild', function() {
        it('is stable on unchanged rebuild with include', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            include: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);
          yield output.build();

          const beforeStat = fs.statSync(output.dir);

          yield fsTick();
          yield output.build();

          const afterStat = fs.statSync(output.dir);
          assertStatEqual(beforeStat, afterStat);
        }));

        it('is stable on unchanged rebuild with exclude', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            exclude: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);
          yield output.build();

          const beforeStat = fs.statSync(output.dir);

          yield fsTick();
          yield output.build();

          const afterStat = fs.statSync(output.dir);
          assertStatEqual(beforeStat, afterStat);
        }));

        it('is stable when changes occur outside dep graph and using include', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            include: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);
          yield output.build();

          const beforeStat = fs.statSync(output.dir);
          yield fsTick();

          input.write({
            'engine.js': ''
          });

          yield output.build();

          const afterStat = fs.statSync(output.dir);
          assertStatEqual(beforeStat, afterStat, 'stable rebuild when modifying file NOT in dep graph');
        }));

        it('updates when changes occur in dep graph and using include', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            include: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);

          yield output.build();
          let directory = output.dir;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          const beforeStat = fs.statSync(directory);

          expect(walkSync(directory)).to.deep.equal([ 'routes.js', 'utils/', 'utils/derp.js', 'utils/foo.js' ]);

          yield fsTick();

          if (FIXTURE.usingModulesDir) {
            input.write({
              'modules': {
                'routes.js': 'import herp from "utils/herp";'
              }
            });

          } else {
            input.write({
              'routes.js': 'import herp from "utils/herp";'
            });
          }

          yield output.build();

          const afterStat = fs.statSync(directory);
          assertStatChange(beforeStat, afterStat, 'instable rebuild when modifying file in dep graph');

          expect(walkSync(directory)).to.deep.equal([ 'routes.js', 'utils/', 'utils/herp.js' ]);
        }));

        it('updates when changes occur outside dep graph and using exclude', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            exclude: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });

          output = createBuilder(subject);

          yield output.build();
          let directory = output.dir;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          const engineStat = fs.statSync(directory + '/engine.js');
          const routesStat = fs.statSync(directory + '/utils/herp.js');

          yield fsTick();

          let updateLocation;
          if (FIXTURE.usingModulesDir) {
            updateLocation = output.path() + '/modules';
            input.write({
              'modules': {
                'engine.js': ''
              }
            });
          } else {
            updateLocation = output.path();
            input.write({
              'engine.js': ''
            });
          }

          yield output.build();

          const engineRebuildStat = fs.statSync(directory + '/engine.js');
          assertStatChange(engineStat, engineRebuildStat, 'engine.js changed');

          let routesRebuildStat = fs.statSync(directory + '/utils/herp.js');
          assertStatEqual(routesStat, routesRebuildStat, 'routes.js unchanged');

          yield fsTick();

          fs.unlinkSync(path.join(updateLocation, 'engine.js'));

          yield output.build();

          expect(file(directory + '/engine.js')).to.not.exist;

          routesRebuildStat = fs.statSync(directory + '/utils/herp.js');
          assertStatEqual(routesStat, routesRebuildStat, 'routes.js unchanged second time');
        }));

        it('updates when changes occur in dep graph and using exclude', co.wrap(function* () {
          let subject = new BroccoliDependencyFunnel(input.path(), {
            exclude: true,
            entry: 'routes.js',
            external: [ 'ember-engines/routes' ]
          });
          output = createBuilder(subject);

          yield output.build();

          let directory = output.dir;

          if (FIXTURE.usingModulesDir) {
            directory = path.join(directory, 'modules');
          }

          const buildStat = fs.statSync(directory);

          expect(walkSync(directory)).to.deep.equal([ 'engine.js', 'utils/', 'utils/herp.js' ]);

          yield fsTick();

          if (FIXTURE.usingModulesDir) {
            input.write({
              'modules': {
                'routes.js': 'import herp from "utils/herp";'
              }
            });
          } else {
            input.write({
              'routes.js': 'import herp from "utils/herp";'
            });
          }

          yield output.build();

          const rebuildStat = fs.statSync(directory);
          assertStatChange(rebuildStat, buildStat, 'instable rebuild when modifying file in dep graph');

          expect(walkSync(directory)).to.deep.equal([ 'engine.js', 'utils/', 'utils/derp.js', 'utils/foo.js' ]);
        }));
      });
    });
  });
});
