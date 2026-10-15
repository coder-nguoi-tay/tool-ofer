import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveChromeDownloads, selectChromeMajors } from './chrome-versions.mjs';

/**
 * Xác nhận dải Chrome major bỏ qua bản Stable mới nhất và lùi đủ số bản yêu cầu.
 * @return {void} Hoàn tất khi dải major khớp mong đợi.
 * @throws {AssertionError} Khi dải major sai hướng hoặc sai số lượng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
function selectsChromeMajorRangeBelowStable() {
  assert.deepEqual(selectChromeMajors(155, 10), [145, 146, 147, 148, 149, 150, 151, 152, 153, 154]);
  assert.deepEqual(selectChromeMajors(155, 3), [152, 153, 154]);
  assert.deepEqual(selectChromeMajors(155, 3, 0), [153, 154, 155]);
  assert.throws(() => selectChromeMajors(155, 1));
  assert.throws(() => selectChromeMajors(155, 13));
  assert.throws(() => selectChromeMajors(Number.NaN, 10));
}

test('Chrome major range skips the newest stable by default', selectsChromeMajorRangeBelowStable);

/**
 * Xác nhận mỗi major lấy patch mới nhất đúng nền tảng và URL lạ bị loại.
 * @return {void} Hoàn tất khi danh mục được rút gọn đúng.
 * @throws {AssertionError} Khi chọn sai patch hoặc nhận URL ngoài kho Google.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
function resolvesNewestPatchFromTrustedBucket() {
  const entry = (version, platform, host = 'https://storage.googleapis.com/chrome-for-testing-public') => ({
    version,
    downloads: { chrome: [{ platform, url: `${host}/${version}/${platform}/chrome-${platform}.zip` }] },
  });
  const catalog = {
    versions: [
      entry('150.0.1.9', 'mac-arm64'),
      entry('150.0.2.1', 'mac-arm64'),
      entry('150.0.10.0', 'mac-x64'),
      entry('151.0.1.0', 'mac-arm64'),
      entry('152.0.1.0', 'mac-arm64', 'https://example.com'),
    ],
  };
  const { downloads, unavailableMajors } = resolveChromeDownloads(catalog, [150, 151, 152, 153], 'mac-arm64');
  assert.deepEqual(downloads.map((download) => download.version), ['150.0.2.1', '151.0.1.0']);
  assert.deepEqual(unavailableMajors, [152, 153]);
  assert.throws(() => resolveChromeDownloads({}, [150], 'mac-arm64'));
}

test('each Chrome major resolves to its newest patch from the official bucket', resolvesNewestPatchFromTrustedBucket);
