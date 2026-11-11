import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

/**
 * Liệt kê các bản SunBrowser đã cài hoàn chỉnh theo thứ tự mới đến cũ.
 *
 * @param {string} installationDirectory Thư mục các kernel AdsPower trên macOS.
 * @return {Promise<string[]>} Các phiên bản Chrome có binary chạy được.
 * @throws {Error} Khi AdsPower chưa tải xong bất kỳ kernel SunBrowser nào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function listInstalledAdsPowerKernelVersions(installationDirectory = join(homedir(), 'Library', 'Application Support', 'adspower_global', 'cwd_global')) {
  const installations = await readdir(installationDirectory).catch(() => []);
  const versions = installations.map(name => /^chrome_(\d+)$/.exec(name)).filter(Boolean).map(match => Number(match[1])).sort((left, right) => right - left);
  const installedVersions = [];
  for (const version of versions) {
    const browserBinary = join(installationDirectory, `chrome_${version}`, 'SunBrowser.app', 'Contents', 'MacOS', 'SunBrowser');
    if (await access(browserBinary, constants.X_OK).then(() => true, () => false)) installedVersions.push(String(version));
  }
  if (installedVersions.length) return installedVersions;
  throw new Error('AdsPower chưa có SunBrowser đã tải xong. Hãy mở AdsPower và tải một bản SunBrowser trước khi chạy.');
}
export { listInstalledAdsPowerKernelVersions };
