import { listInstalledAdsPowerKernelVersions } from './list-installed-ads-power-kernel-versions.mjs';

/**
 * Chọn SunBrowser mới nhất đã cài cho nơi chỉ cần một profile.
 *
 * @param {string} installationDirectory Thư mục các kernel AdsPower trên macOS.
 * @return {Promise<string>} Phiên bản Chrome mới nhất có binary chạy được.
 * @throws {Error} Khi AdsPower chưa tải xong bất kỳ kernel SunBrowser nào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function findInstalledAdsPowerKernelVersion(installationDirectory) {
  return (await listInstalledAdsPowerKernelVersions(installationDirectory))[0];
}
export { findInstalledAdsPowerKernelVersion };
