import { installChromeVersions } from '../../../chrome-versions.mjs';

/**
 * Tải các bản Chrome for Testing vào kho thử nghiệm riêng.
 *
 * @param {string} requestBody JSON gồm số phiên bản cần có.
 * @return {Promise<{results: string[], warnings: string[]}>} Các bản Chrome đang có trên máy.
 * @throws {Error} Khi không gọi được danh mục Google hoặc giải nén thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function downloadRealChromeVersions(requestBody) {
  const body = requestBody ? JSON.parse(requestBody) : {};
  const versionCount = body.chromeVersionCount === undefined || body.chromeVersionCount === '' ? 10 : Number(body.chromeVersionCount);
  // ponytail: tiến độ chỉ ra stdout, UI đứng chờ tới khi xong; thêm /state nếu thấy lâu.
  const {
    builds,
    downloadedVersions,
    warnings
  } = await installChromeVersions({
    versionCount,
    onProgress: message => console.log(message)
  });
  return {
    results: [downloadedVersions.length > 0 ? `Đã tải ${downloadedVersions.length} bản: ${downloadedVersions.join(', ')}.` : 'Không cần tải thêm; các bản yêu cầu đã có trên máy.', `Kho Chrome for Testing có ${builds.length} bản: ${builds.map(build => build.version).join(', ')}.`],
    warnings
  };
}
