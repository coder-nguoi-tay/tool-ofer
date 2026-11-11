import { chromeForTestingDownloadOrigin } from './state/chrome-for-testing-download-origin.mjs';
import { chromeForTestingDownloadPrefix } from './state/chrome-for-testing-download-prefix.mjs';
import { chromeVersionPattern } from './state/chrome-version-pattern.mjs';
import { comparePatchOrder } from './compare-patch-order.mjs';

/**
 * Lấy bản patch mới nhất của từng major trong danh mục Chrome for Testing.
 *
 * Danh mục tải từ Internet nên URL được kiểm origin và version được kiểm định dạng trước
 * khi dùng làm tên thư mục.
 *
 * @param {object} catalog Nội dung known-good-versions-with-downloads.json.
 * @param {number[]} majors Các major cần tìm.
 * @param {string} platform Nền tảng Chrome for Testing, ví dụ mac-arm64.
 * @return {{downloads: {major: number, version: string, url: string}[], unavailableMajors: number[]}} Bản tải được và major thiếu.
 * @throws {Error} Khi danh mục không đúng định dạng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function resolveChromeDownloads(catalog, majors, platform) {
  if (!Array.isArray(catalog?.versions)) throw new Error('Danh mục Chrome for Testing không đúng định dạng.');
  const downloads = [];
  const unavailableMajors = [];
  for (const major of majors) {
    let best = null;
    for (const entry of catalog.versions) {
      const version = String(entry?.version ?? '');
      if (!chromeVersionPattern.test(version) || Number(version.split('.')[0]) !== major) continue;
      const url = entry.downloads?.chrome?.find(download => download.platform === platform)?.url;
      if (typeof url !== 'string') continue;
      let downloadUrl;
      try {
        downloadUrl = new URL(url);
      } catch {
        continue;
      }
      if (downloadUrl.origin !== chromeForTestingDownloadOrigin || !downloadUrl.pathname.startsWith(chromeForTestingDownloadPrefix)) continue;
      if (best && comparePatchOrder(version, best.version) <= 0) continue;
      best = {
        major,
        version,
        url: downloadUrl.href
      };
    }
    if (best) downloads.push(best);else unavailableMajors.push(major);
  }
  return {
    downloads,
    unavailableMajors
  };
}
export { resolveChromeDownloads };
