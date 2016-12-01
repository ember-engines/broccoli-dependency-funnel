import fs from 'fs';

/**
 * Stats a path. If it exists, it returns the stat information. Otherwise it
 * returns null.
 *
 * @param {String} path
 * @return {fs.Stats}
 */
export default function existsStat(path) {
  try {
    const stat = fs.statSync(path);
    return stat;
  } catch (e) {
    return null;
  }
}
