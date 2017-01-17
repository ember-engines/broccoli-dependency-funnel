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
    // TODO: change mr-dep-walk API to expose found vs missing (aka external) deps
    // if sourcePath does not exist, do nothing
    if (!existsSync(sourcePath)) {
      return;
    }

    // If it failed, make sure the directory exists
    if (!existsSync(destDir)) {
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
}
