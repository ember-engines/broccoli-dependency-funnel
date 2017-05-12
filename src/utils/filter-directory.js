'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Filter the files in a directory that match a given predicate.
 *
 * @param {String} directory
 * @param {String} prefix - Path prefix for recursing
 * @param {Function} predicate
 * @return {Array<String>}
 */
module.exports = function filterDirectory(directory, prefix, predicate) {
  let inodes = fs.readdirSync(directory);
  let files = [];

  for (let i = 0; i < inodes.length; i++) {
    let inode = inodes[i];
    let fullPath = path.join(directory, inode);
    let currentPath = path.join(prefix, inode);
    let isDirectory = fs.statSync(fullPath).isDirectory();

    if (isDirectory) {
      files.push.apply(files, filterDirectory(fullPath, currentPath, predicate));
    } else if (predicate(currentPath)) {
      files.push(currentPath);
    }
  }

  return files;
};
