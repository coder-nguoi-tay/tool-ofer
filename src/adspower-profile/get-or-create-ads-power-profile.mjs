import { createAdsPowerProfile } from './create-ads-power-profile.mjs';
import { requestAdsPower } from './request-ads-power.mjs';
import { updateAdsPowerProfile } from './update-ads-power-profile.mjs';

/**
 * Lấy một profile AdsPower nhàn rỗi trong tài khoản để tái sử dụng, hoặc tạo mới nếu chưa có.
 * Giúp tránh triệt để lỗi "Exceeding import daily limit" khi chạy tự bù nhiều phiên liên tục.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {object} profileRequest Payload profile đã dựng.
 * @param {Set<string>} [activeProfileIds=new Set()] Danh sách profile đang chạy.
 * @param {number} [slot=1] Số slot gán profile.
 * @param {typeof fetch} [request=fetch] Hàm fetch.
 * @return {Promise<string>} ID profile (tái sử dụng hoặc tạo mới).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function getOrCreateAdsPowerProfile(apiKey, profileRequest, activeProfileIds = new Set(), slot = 1, request = fetch) {
  const activeSet = activeProfileIds instanceof Set ? activeProfileIds : new Set(activeProfileIds || []);
  try {
    const data = await requestAdsPower(apiKey, '/api/v1/user/list?page=1&page_size=100', null, request);
    const list = Array.isArray(data?.list) ? data.list : [];

    // Tìm profile nhàn rỗi (không nằm trong activeProfileIds)
    const idleProfile = list.find(item => !activeSet.has(item.user_id) && (item.name?.includes(`Slot ${slot}`) || item.name?.includes('Slot') || item.remark?.includes('AutoLeadPC'))) || list.find(item => !activeSet.has(item.user_id));
    if (idleProfile) {
      console.log(`[AdsPower] ♻️ Tái sử dụng profile có sẵn ${idleProfile.user_id} (${idleProfile.name || 'Slot ' + slot}) cho Slot ${slot} (tiết kiệm quota API).`);
      try {
        // BẮT BUỘC cập nhật cả fingerprint_config theo profileRequest hiện tại:
        // nếu không, slot nào cũng nhận fingerprint của lần tạo cũ → thiết bị/OS/phiên bản
        // không thay đổi giữa các slot dù deviceProfile đã xoay vòng ở tầng app.
        // AdsPower User Update API không cho đè fingerprint trần khi profile đang chạy,
        // nên chỉ merge fingerprint chưa có/khác — với profile nhàn rỗi thì hợp lệ.
        await updateAdsPowerProfile(apiKey, idleProfile.user_id, {
          name: profileRequest.name,
          user_proxy_config: profileRequest.user_proxy_config,
          tabs: profileRequest.tabs,
          fingerprint_config: profileRequest.fingerprint_config
        }, request);
      } catch (updateErr) {
        console.warn(`[AdsPower] Cập nhật proxy/fingerprint profile ${idleProfile.user_id}: ${updateErr.message}`);
      }
      return idleProfile.user_id;
    }
  } catch (listErr) {
    console.warn(`[AdsPower] Kiểm tra danh sách profile có sẵn: ${listErr.message}`);
  }

  // Nếu không có profile nào rảnh thì mới tạo mới
  return createAdsPowerProfile(apiKey, profileRequest, request);
}
export { getOrCreateAdsPowerProfile };
