import { requestMultiloginCloud } from './request-multilogin-cloud.mjs';

/**
 * Cập nhật thông tin proxy, tên cho profile Multilogin đã có sẵn (tái sử dụng pool).
 *
 * @param {string} token API Bearer token của Multilogin.
 * @param {string} profileId ID profile cần cập nhật.
 * @param {object} updates Các trường cập nhật (name, parameters, v.v.).
 * @param {typeof fetch} [request=fetch] Hàm fetch để gửi request hoặc mock test.
 * @return {Promise<object>} Kết quả cập nhật từ Cloud API.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function updateMultiloginProfile(token, profileId, updates, request = fetch) {
  return requestMultiloginCloud(token, `/api/v2/profile/${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: updates
  }, request);
}
