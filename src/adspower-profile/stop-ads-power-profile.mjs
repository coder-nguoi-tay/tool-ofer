import { requestAdsPower } from './request-ads-power.mjs';

/**
 * Dừng profile SunBrowser do AutoLeadPC đã mở.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {string} profileId ID profile cần dừng.
 * @param {typeof fetch} request Hàm HTTP để thử nghiệm.
 * @return {Promise<void>} Hoàn tất khi AdsPower xác nhận dừng.
 * @throws {Error} Khi Local API từ chối dừng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function stopAdsPowerProfile(apiKey, profileId, request = fetch) {
  try {
    await requestAdsPower(apiKey, '/api/v2/browser-profile/stop', {
      profile_id: profileId
    }, request);
  } catch (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('not open') || msg.includes('not running') || msg.includes('not exist')) {
      return;
    }
    throw error;
  }
}
export { stopAdsPowerProfile };
