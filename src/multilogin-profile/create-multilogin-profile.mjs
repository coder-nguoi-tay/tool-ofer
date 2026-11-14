import { requestMultiloginCloud } from './request-multilogin-cloud.mjs';

/**
 * Tạo profile Multilogin X mới và nhận ID để quản lý.
 *
 * @param {string} token API Bearer token của Multilogin.
 * @param {object} profileRequest Payload profile đã dựng.
 * @param {typeof fetch} [request=fetch] Hàm fetch để gửi request hoặc mock test.
 * @return {Promise<string>} ID profile mới.
 * @throws {Error} Khi API không tạo được profile hoặc thiếu ID.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function createMultiloginProfile(token, profileRequest, request = fetch) {
  const result = await requestMultiloginCloud(token, '/api/v2/profile', {
    method: 'POST',
    body: profileRequest
  }, request);

  const profileId = result?.id || result?.profile_id || result?.uuid;
  if (!profileId) {
    throw new Error('Multilogin không trả về profile ID sau khi tạo profile.');
  }
  return String(profileId);
}
