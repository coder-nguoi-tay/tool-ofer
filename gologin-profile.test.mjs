import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoLoginProfileRequest, createGoLoginProfile, deleteGoLoginProfile } from './gologin-profile.mjs';

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

test('GoLogin profile payload', testGoLoginProfilePayload);
test('GoLogin profile creation', testGoLoginProfileCreation);
test('GoLogin profile deletion', testGoLoginProfileDeletion);
