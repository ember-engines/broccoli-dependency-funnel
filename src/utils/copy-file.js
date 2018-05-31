'use strict';

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const symlinkOrCopy = require('symlink-or-copy');

/**
 * Copies an input path to an output path by using the _copy
 *
 * @param {Plugin} context
 * @return {Void}
 */
module.exports = function copyFile(sourcePath, destPath) {
  let destDir = path.dirname(destPath);

  try {
    symlinkOrCopy.sync(sourcePath, destPath);
  } catch(e) {
    // TODO: change mr-dep-walk API to expose found vs missing (aka external) deps
    // if sourcePath does not exist, do nothing
    if (!fs.existsSync(sourcePath)) {
      return;
    }

    // If it failed, make sure the directory exists
    if (!fs.existsSync(destDir)) {
      mkdirp.sync(destDir);
    }

    // Also, make sure nothing already exists in the destination
    try {
      fs.unlinkSync(destPath);
    } catch(e) {
      // Continue regardless of error
    }

    symlinkOrCopy.sync(sourcePath, destPath);
  }
};
