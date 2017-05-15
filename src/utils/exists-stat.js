'use strict';

const fs = require('fs');
/**
 * Stats a path. If it exists, it returns the stat information. Otherwise it
 * returns null.
 *
 * @param {String} path
 * @return {fs.Stats}
 */
module.exports = function existsStat(path) {
  try {
    return fs.statSync(path);
  } catch (e) {
    return null;
  }
}
