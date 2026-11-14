import { requestMultiloginCloud } from './request-multilogin-cloud.mjs';

/**
 * Xóa profile Multilogin sau khi phiên kết thúc nếu không dùng cơ chế pool.
 *
 * @param {string} token API Bearer token của Multilogin.
 * @param {string} profileId ID profile cần xóa.
 * @param {typeof fetch} [request=fetch] Hàm fetch để gửi request hoặc mock test.
 * @return {Promise<void>} Hoàn tất khi Cloud API xác nhận xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function deleteMultiloginProfile(token, profileId, request = fetch) {
  if (!profileId) return;
  await requestMultiloginCloud(token, `/api/v2/profile/${encodeURIComponent(profileId)}`, {
    method: 'DELETE'
  }, request);
}
