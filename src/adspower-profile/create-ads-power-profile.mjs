import { cleanupOrphanedAdsPowerProfiles } from './cleanup-orphaned-ads-power-profiles.mjs';
import { requestAdsPower } from './request-ads-power.mjs';

/**
 * Tạo profile AdsPower mới cho một slot và nhận ID để quản lý vòng đời.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {object} profileRequest Payload profile đã dựng.
 * @param {typeof fetch} request Hàm HTTP để thử nghiệm.
 * @return {Promise<string>} ID profile mới.
 * @throws {Error} Khi API không tạo được profile hoặc thiếu ID.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function createAdsPowerProfile(apiKey, profileRequest, request = fetch) {
  let created;
  try {
    created = await requestAdsPower(apiKey, '/api/v2/browser-profile/create', profileRequest, request);
  } catch (error) {
    const errorMsg = String(error.message || '').toLowerCase();
    if (errorMsg.includes('limit') || errorMsg.includes('exceeds')) {
      const cleaned = await cleanupOrphanedAdsPowerProfiles(apiKey, new Set(), request);
      if (cleaned > 0) {
        created = await requestAdsPower(apiKey, '/api/v2/browser-profile/create', profileRequest, request);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
  if (!created?.profile_id) throw new Error('AdsPower tạo profile nhưng không trả profile_id.');
  return created.profile_id;
}
export { createAdsPowerProfile };
