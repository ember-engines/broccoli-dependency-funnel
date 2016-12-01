import fs from 'fs';
import path from 'path';

/**
 * Filter the files in a directory that match a given predicate.
 *
 * @param {String} directory
 * @param {String} prefix - Path prefix for recursing
 * @param {Function} predicate
 * @return {Array<String>}
 */
export default function filterDirectory(directory, prefix, predicate) {
  const inodes = fs.readdirSync(directory);
  const files = [];

  for (let i = 0; i < inodes.length; i++) {
    const inode = inodes[i];
    const fullPath = path.join(directory, inode);
    const currentPath = path.join(prefix, inode);
    const isDirectory = fs.statSync(fullPath).isDirectory();

    if (isDirectory) {
      files.push(...filterDirectory(fullPath, currentPath, predicate));
    } else if (predicate(currentPath)) {
      files.push(currentPath);
    }
  }

  return files;
}
