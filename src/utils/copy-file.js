import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import existsSync from 'exists-sync';
import symlinkOrCopy from 'symlink-or-copy';

/**
 * Copies an input path to an output path by using the _copy
 *
 * @param {Plugin} context
 * @return {Void}
 */
export default function copyFile(sourcePath, destPath) {
  const destDir = path.dirname(destPath);

  try {
    symlinkOrCopy.sync(sourcePath, destPath);
  } catch(e) {
    // If it failed, make sure the directory exists
    if (!existsSync(destDir)) {
      mkdirp.sync(destDir);
    }

    // Also, make sure nothing already exists in the destination
    try {
      fs.unlinkSync(destPath);
    } catch(e) {}

    symlinkOrCopy.sync(sourcePath, destPath);
  }
}
