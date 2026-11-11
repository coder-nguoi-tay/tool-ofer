import { chromeChannelDirectory } from '../chrome-paths.mjs';
import { chromeRegularBuildDirectory } from '../chrome-paths.mjs';
import { installedChromeAppPath } from '../chrome-paths.mjs';
import { join } from 'node:path';
import { listInstalledChromeVersions } from '../../../chrome-versions.mjs';
import { readInstalledChromeChannel } from './read-installed-chrome-channel.mjs';
import { readdir } from 'node:fs/promises';

/**
 * Liệt kê Chrome thường từ bản 150 trở lên, mỗi major chỉ một bản.
 *
 * @return {Promise<{executablePath: string, version: string, major: number, channel: string}[]>} Các kênh khả dụng.
 * @throws {Error} Khi không tìm thấy kênh Stable mặc định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function listInstalledChromeChannels() {
  const stableApp = installedChromeAppPath;
  const archivedAppNames = await readdir(chromeRegularBuildDirectory).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const channelApps = [...archivedAppNames.sort().map(appName => {
    const archiveName = appName.match(/^Google Chrome(?: (Beta|Dev|Canary))? (1\d{2}(?:\.\d+){3})\.app$/);
    return archiveName ? [(archiveName[1] || 'stable').toLowerCase(), join(chromeRegularBuildDirectory, appName)] : null;
  }).filter(Boolean), ['stable', stableApp], ['beta', join(chromeChannelDirectory, 'Google Chrome Beta.app')], ['dev', join(chromeChannelDirectory, 'Google Chrome Dev.app')], ['canary', join(chromeChannelDirectory, 'Google Chrome Canary.app')],
  // Kho Chrome for Testing xếp cuối: bổ sung các major còn thiếu cho vòng xoay
  // (máy chỉ giữ được số ít bản stable dạng archive). Chỉ nhận major ≥ 150 vì
  // profile mẫu RoboForm tạo bằng Chrome 150 — build cũ hơn sẽ không được chép RoboForm.
  ...(await listInstalledChromeVersions()).filter(build => build.major >= 150).map(build => [build.version, join(build.executablePath, '..', '..', '..'), 150])];
  const builds = [];
  const seenMajors = new Set();
  for (const [channel, appPath, minimumMajor = 150] of channelApps) {
    try {
      const build = await readInstalledChromeChannel(appPath, channel);
      if (build.major >= minimumMajor && !seenMajors.has(build.major)) {
        builds.push(build);
        seenMajors.add(build.major);
      }
    } catch (error) {
      if (channel === 'stable') {
        throw new Error(`Không tìm thấy Google Chrome thường tại ${stableApp}: ${error.message}`);
      }
    }
  }
  return builds;
}
export { listInstalledChromeChannels };
