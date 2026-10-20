import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoLoginProfileRequest, createGoLoginProfile, deleteGoLoginProfile, parseGoLoginBookmarks, updateGoLoginProfileBookmarks } from './gologin-profile.mjs';

/**
 * Xác nhận proxy 711 dạng HTTPS và các tùy chọn fingerprint tạo đúng payload GoLogin.
 *
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
function testGoLoginProfilePayload() {
  const request = buildGoLoginProfileRequest({
    slot: 2,
    proxy: { server: 'https://proxy.example:8443', username: 'account', password: 'secret' },
    websiteUrl: 'https://example.com',
    antiFingerprint: { canvas: true, clientRects: true, webgl: true, webrtc: true },
  });
  assert.deepEqual(request.proxy, { mode: 'http', host: 'proxy.example', port: 8443, username: 'account', password: 'secret' });
  assert.equal(request.os, 'mac');
  assert.equal(request.canvas.mode, 'noise');
  assert.equal(request.webRTC.mode, 'public');
  assert.equal(request.startUrl, 'https://example.com');
}

/**
 * Đảm bảo tùy chọn hệ điều hành của Settings được chuyển thành mã OS GoLogin.
 *
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
function testGoLoginOperatingSystemMapping() {
  assert.equal(buildGoLoginProfileRequest({ slot: 1, deviceProfile: 'windows' }).os, 'win');
  assert.equal(buildGoLoginProfileRequest({ slot: 1, deviceProfile: 'linux' }).os, 'lin');
  assert.equal(buildGoLoginProfileRequest({ slot: 1, deviceProfile: 'android' }).os, 'android');
}

/**
 * Confirma User-Agent và navigator theo OS được gửi cùng profile thay vì chỉ lưu cấu hình.
 *
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
function testConfiguredUserAgentPayload() {
  const request = buildGoLoginProfileRequest({ slot: 1, deviceProfile: 'windows', userAgent: 'Mozilla/5.0 Chrome/123.0.0.0', resolution: '1920x1080' });
  assert.deepEqual(request.navigator, { userAgent: 'Mozilla/5.0 Chrome/123.0.0.0', resolution: '1920x1080', language: 'en-US,en', platform: 'Win32' });
}

/**
 * Xác nhận bật Fonts trong Settings cấu hình GoLogin font masking theo hệ điều hành.
 *
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
function testGoLoginFontMaskingPayload() {
  const enabledRequest = buildGoLoginProfileRequest({ slot: 1, deviceProfile: 'windows', antiFingerprint: { fonts: true } });
  assert.equal(enabledRequest.fonts.enableMasking, true);
  assert.equal(enabledRequest.fonts.enableDomRect, true);
  assert.ok(enabledRequest.fonts.families.includes('Segoe UI'));
  const disabledRequest = buildGoLoginProfileRequest({ slot: 1, deviceProfile: 'windows', antiFingerprint: { fonts: false } });
  assert.equal('fonts' in disabledRequest, false);
}

/**
 * Xác nhận checkbox Api Fake IP bật/tắt đúng quyền và dữ liệu vị trí trong profile.
 *
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
function testGoLoginApiFakeIpSetting() {
  const enabledRequest = buildGoLoginProfileRequest({ slot: 1, antiFingerprint: { apiFakeIP: true } });
  assert.deepEqual(enabledRequest.geolocation, { mode: 'allow', enabled: true, fillBasedOnIp: true });
  assert.deepEqual(enabledRequest.timezone, { enabled: true, fillBasedOnIp: true });
  const disabledRequest = buildGoLoginProfileRequest({ slot: 1, antiFingerprint: { apiFakeIP: false } });
  assert.deepEqual(disabledRequest.geolocation, { mode: 'prompt', enabled: false, fillBasedOnIp: false });
}

/**
 * Xác nhận parser giữ bookmark đơn và phân nhóm folder theo định dạng file PC.
 *
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
function testGoLoginBookmarkParsing() {
  const bookmarks = parseGoLoginBookmarks('Folder::Example::https://example.com\nGoogle::https://google.com\nhttps://direct.example');
  assert.equal(bookmarks.bookmark_bar.children[0].name, 'Folder');
  assert.equal(bookmarks.bookmark_bar.children[0].children[0].url, 'https://example.com');
  assert.equal(bookmarks.bookmark_bar.children[1].name, 'Google');
  assert.equal(bookmarks.bookmark_bar.children[2].url, 'https://direct.example');
  assert.equal(parseGoLoginBookmarks('invalid line'), null);
}

/**
 * Xác nhận bookmark được gửi đến đúng profile qua endpoint GoLogin.
 *
 * @return {Promise<void>} Hoàn tất sau khi kiểm tra request mock.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function testGoLoginBookmarkUpdate() {
  const bookmarks = parseGoLoginBookmarks('Example::https://example.com');
  let captured;
  await updateGoLoginProfileBookmarks('sample-token', 'profile-id', bookmarks, async (url, options) => {
    captured = { url, options };
    return new Response(null, { status: 204 });
  });
  assert.equal(captured.url, 'https://api.gologin.com/browser/bookmarks/many');
  assert.deepEqual(JSON.parse(captured.options.body), { profileIds: ['profile-id'], bookmarks });
}

/**
 * Xác nhận app dùng API chính thức và đọc đúng ID mà không gửi request thật.
 *
 * @return {Promise<void>} Hoàn tất sau khi kiểm tra HTTP mock.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function testGoLoginProfileCreation() {
  const capturedRequest = {};
  /**
   * Giả lập GoLogin API tạo profile mà không gửi dữ liệu ra mạng.
   *
   * @param {string} url Endpoint API.
   * @param {object} options Tùy chọn HTTP.
   * @return {Promise<Response>} Phản hồi tạo profile mẫu.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-19
   */
  async function mockCreateRequest(url, options) {
    capturedRequest.url = url;
    capturedRequest.options = options;
    return Response.json({ id: 'new-profile-id' });
  }
  const profileId = await createGoLoginProfile('sample-token', { os: 'mac' }, mockCreateRequest);
  assert.equal(profileId, 'new-profile-id');
  assert.equal(capturedRequest.url, 'https://api.gologin.com/browser/custom');
  assert.equal(capturedRequest.options.headers.Authorization, 'Bearer sample-token');
  assert.deepEqual(JSON.parse(capturedRequest.options.body), { os: 'mac' });
}

/**
 * Kiểm tra thông báo quota API miễn phí được giải thích rõ thay vì chỉ hiện mã 403.
 *
 * @return {Promise<void>} Hoàn tất sau khi xác nhận nội dung lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function testGoLoginApiQuotaError() {
  await assert.rejects(
    createGoLoginProfile('sample-token', { os: 'mac' }, async () => new Response('You have reached your free API requests limit. Please subscribe to continue.', { status: 403 })),
    /hết hạn mức API miễn phí.*nâng cấp gói hoặc liên hệ GoLogin/i,
  );
}

/**
 * Xác nhận app chỉ yêu cầu xóa ID profile vừa tạo và không gọi mạng thật.
 *
 * @return {Promise<void>} Hoàn tất sau khi kiểm tra HTTP mock.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function testGoLoginProfileDeletion() {
  const capturedRequest = {};
  /**
   * Giả lập phản hồi xóa profile của GoLogin.
   *
   * @param {string} url Endpoint API.
   * @param {object} options Tùy chọn HTTP.
   * @return {Promise<Response>} Phản hồi xóa profile mẫu.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-19
   */
  async function mockDeleteRequest(url, options) {
    capturedRequest.url = url;
    capturedRequest.options = options;
    return new Response(null, { status: 204 });
  }
  await deleteGoLoginProfile('sample-token', 'new-profile-id', mockDeleteRequest);
  assert.equal(capturedRequest.url, 'https://api.gologin.com/browser');
  assert.equal(capturedRequest.options.method, 'DELETE');
  assert.deepEqual(JSON.parse(capturedRequest.options.body), { profilesToDelete: ['new-profile-id'] });
}

test('GoLogin 402 báo rõ nguyên nhân và số profile', async () => {
  const calls = [];
  const mock = async (url, options) => {
    calls.push(`${options.method} ${url}`);
    if (url.endsWith('/browser/custom')) return Response.json({ message: 'Profiles limit exceeded' }, { status: 402 });
    return Response.json({ allProfilesCount: 103, profiles: [{ name: 'AutoLeadPC Mac 2 - Slot 1' }, { name: 'AutoLeadPC Mac 2 - Slot 2' }, { name: 'Tay' }] });
  };
  await assert.rejects(createGoLoginProfile('sample-token', { os: 'mac' }, mock), (error) => {
    assert.match(error.message, /HTTP 402/);
    assert.match(error.message, /103 profile, trong đó 2 profile do AutoLeadPC tạo/);
    assert.match(error.message, /GoLogin báo: Profiles limit exceeded/);
    return true;
  });
  assert.deepEqual(calls, ['POST https://api.gologin.com/browser/custom', 'GET https://api.gologin.com/browser/v2']);
});

test('GoLogin lỗi khác kèm lời giải thích của máy chủ', async () => {
  const mock = async () => Response.json({ message: 'Invalid token' }, { status: 401 });
  await assert.rejects(createGoLoginProfile('bad', { os: 'mac' }, mock), /HTTP 401\): Invalid token/);
});

test('Xoá profile thử lại bằng endpoint xoá từng profile', async () => {
  const calls = [];
  const mock = async (url, options) => {
    calls.push(`${options.method} ${url}`);
    return url.endsWith('/browser') ? new Response(null, { status: 400 }) : new Response(null, { status: 204 });
  };
  await deleteGoLoginProfile('sample-token', 'abc', mock);
  assert.deepEqual(calls, ['DELETE https://api.gologin.com/browser', 'DELETE https://api.gologin.com/browser/abc']);
});

test('GoLogin profile payload', testGoLoginProfilePayload);
test('GoLogin operating system mapping', testGoLoginOperatingSystemMapping);
test('GoLogin configured user-agent payload', testConfiguredUserAgentPayload);
test('GoLogin font masking payload', testGoLoginFontMaskingPayload);
test('GoLogin API fake IP setting', testGoLoginApiFakeIpSetting);
test('GoLogin bookmark parsing', testGoLoginBookmarkParsing);
test('GoLogin bookmark update', testGoLoginBookmarkUpdate);
test('GoLogin profile creation', testGoLoginProfileCreation);
test('GoLogin API quota error', testGoLoginApiQuotaError);
test('GoLogin profile deletion', testGoLoginProfileDeletion);
