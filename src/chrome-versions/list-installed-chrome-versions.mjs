import { access } from 'node:fs/promises';
import { chromeBuildDirectory } from './state/chrome-build-directory.mjs';
import { chromeForTestingPlatform } from './chrome-for-testing-platform.mjs';
import { chromeVersionPattern } from './state/chrome-version-pattern.mjs';
import { comparePatchOrder } from './compare-patch-order.mjs';
import { constants as fileConstants } from 'node:fs';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { stat } from 'node:fs/promises';

/**
 * Liệt kê các bản Chrome for Testing đã tải về máy này.
 *
 * @return {Promise<{name: string, executablePath: string, version: string, major: number}[]>} Build theo major tăng dần.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function listInstalledChromeVersions() {
  const platform = chromeForTestingPlatform();
  let entries;
  try {
    entries = await readdir(chromeBuildDirectory);
  } catch {
    return [];
  }
  const buildsByMajor = new Map();
  for (const version of entries) {
    if (!chromeVersionPattern.test(version)) continue;
    const executablePath = join(chromeBuildDirectory, version, 'chrome-' + platform, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    try {
      if (!(await stat(executablePath)).isFile()) continue;
      await access(executablePath, fileConstants.X_OK);
    } catch {
      continue;
    }
    const major = Number(version.split('.')[0]);
    const existing = buildsByMajor.get(major);
    if (existing && comparePatchOrder(version, existing.version) <= 0) continue;
    buildsByMajor.set(major, {
      name: 'Chrome ' + major + ' for Testing',
      executablePath,
      version,
      major
    });
  }
  return [...buildsByMajor.values()].sort((left, right) => left.major - right.major);
}
export { listInstalledChromeVersions };
