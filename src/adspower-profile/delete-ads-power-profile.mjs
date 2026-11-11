import { requestAdsPower } from './request-ads-power.mjs';

/**
 * Xóa profile tạm sau khi slot đóng để hoàn lại hạn mức profile.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {string} profileId ID profile tạm của AutoLeadPC.
 * @param {typeof fetch} request Hàm HTTP để thử nghiệm.
 * @return {Promise<void>} Hoàn tất khi AdsPower xác nhận xóa.
 * @throws {Error} Khi Local API từ chối xóa profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function deleteAdsPowerProfile(apiKey, profileId, request = fetch) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await requestAdsPower(apiKey, '/api/v2/browser-profile/delete', {
        profile_id: [profileId]
      }, request);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
  }
  throw lastError;
}
export { deleteAdsPowerProfile };
