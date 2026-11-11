import { maximumChromeVersions } from './state/maximum-chrome-versions.mjs';

/**
 * Tính dải Chrome major cần tải: không lấy bản mới nhất, không lùi quá sâu vào bản cũ.
 *
 * @param {number} stableMajor Major của kênh Stable hiện tại do Google công bố.
 * @param {number} versionCount Số phiên bản muốn có.
 * @param {number} skipNewestMajors Số major mới nhất bị bỏ qua để tránh bản vừa phát hành.
 * @return {number[]} Danh sách major tăng dần.
 * @throws {Error} Khi major stable không hợp lệ hoặc số lượng ngoài giới hạn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function selectChromeMajors(stableMajor, versionCount, skipNewestMajors = 1) {
  if (!Number.isInteger(stableMajor) || stableMajor < 1) {
    throw new Error('Không đọc được Chrome major của kênh Stable.');
  }
  if (!Number.isInteger(versionCount) || versionCount < 2 || versionCount > maximumChromeVersions) {
    throw new Error('Số phiên bản Chrome phải là số nguyên từ 2 đến ' + maximumChromeVersions + '.');
  }
  if (!Number.isInteger(skipNewestMajors) || skipNewestMajors < 0 || skipNewestMajors > 5) {
    throw new Error('Số major mới nhất bị bỏ qua phải nằm trong khoảng 0–5.');
  }
  const newestMajor = stableMajor - skipNewestMajors;
  const oldestMajor = newestMajor - versionCount + 1;
  if (oldestMajor < 1) throw new Error('Dải phiên bản yêu cầu lùi xa hơn Chrome 1.');
  return Array.from({
    length: versionCount
  }, (_, index) => oldestMajor + index);
}
export { selectChromeMajors };
