import { chromeForTestingPlatform } from './chrome-for-testing-platform.mjs';
import { downloadChromeBuild } from './download-chrome-build.mjs';
import { fetchChromeForTestingJson } from './fetch-chrome-for-testing-json.mjs';
import { listInstalledChromeVersions } from './list-installed-chrome-versions.mjs';
import { resolveChromeDownloads } from './resolve-chrome-downloads.mjs';
import { selectChromeMajors } from './select-chrome-majors.mjs';

/**
 * Tải các bản Chrome for Testing còn thiếu.
 *
 * Build chính thức của Google giữ engine, UA và Sec-CH-UA cùng phiên bản.
 *
 * @param {{versionCount?: number, skipNewestMajors?: number, onProgress?: Function}} options Số bản cần có và callback tiến độ.
 * @return {Promise<{builds: object[], downloadedVersions: string[], warnings: string[]}>} Build sau khi tải.
 * @throws {Error} Khi không gọi được danh mục Google hoặc giải nén thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function installChromeVersions({
  versionCount = 10,
  skipNewestMajors = 1,
  onProgress = () => {}
} = {}) {
  const platform = chromeForTestingPlatform();
  const stableVersions = await fetchChromeForTestingJson('last-known-good-versions.json');
  const stableMajor = Number(String(stableVersions?.channels?.Stable?.version ?? '').split('.')[0]);
  const majors = selectChromeMajors(stableMajor, versionCount, skipNewestMajors);
  const alreadyInstalled = await listInstalledChromeVersions();
  const installedMajors = new Set(alreadyInstalled.map(build => build.major));
  const missingMajors = majors.filter(major => !installedMajors.has(major));
  if (missingMajors.length === 0) {
    return {
      builds: alreadyInstalled,
      downloadedVersions: [],
      warnings: []
    };
  }
  onProgress('Đang đọc danh mục Chrome for Testing cho ' + missingMajors.length + ' bản còn thiếu.');
  const catalog = await fetchChromeForTestingJson('known-good-versions-with-downloads.json');
  const {
    downloads,
    unavailableMajors
  } = resolveChromeDownloads(catalog, missingMajors, platform);
  const downloadedVersions = [];
  for (const download of downloads) {
    onProgress('Đang tải Chrome ' + download.version + ' (' + platform + ').');
    await downloadChromeBuild(download, platform);
    downloadedVersions.push(download.version);
  }
  return {
    builds: await listInstalledChromeVersions(),
    downloadedVersions,
    warnings: unavailableMajors.length > 0 ? ['Google không còn bản ' + platform + ' cho Chrome major: ' + unavailableMajors.join(', ') + '.'] : []
  };
}
export { installChromeVersions };
