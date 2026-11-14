import { createMultiloginProfile } from './create-multilogin-profile.mjs';
import { requestMultiloginCloud } from './request-multilogin-cloud.mjs';
import { updateMultiloginProfile } from './update-multilogin-profile.mjs';

/**
 * Lấy profile Multilogin nhàn rỗi trong folder để tái sử dụng, hoặc tạo mới nếu chưa có.
 * Giúp tránh lãng phí hạn mức profile của gói Multilogin khi chạy tự bù liên tục.
 *
 * @param {object} options Cấu hình (token, folderId, slot, profileRequest, activeProfileIds).
 * @param {typeof fetch} [request=fetch] Hàm fetch để gửi request hoặc mock test.
 * @return {Promise<string>} Profile ID sẵn sàng để khởi chạy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function getOrCreateMultiloginProfile({
  token,
  folderId = '',
  slot = 1,
  profileRequest,
  activeProfileIds = new Set()
} = {}, request = fetch) {
  let existingProfiles = [];
  try {
    const query = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : '';
    const res = await requestMultiloginCloud(token, `/api/v2/profile${query}`, { method: 'GET' }, request);
    if (Array.isArray(res)) {
      existingProfiles = res;
    } else if (Array.isArray(res?.profiles)) {
      existingProfiles = res.profiles;
    } else if (Array.isArray(res?.items)) {
      existingProfiles = res.items;
    }
  } catch (err) {
    console.warn(`[Multilogin] Không lấy được danh sách profile từ Cloud: ${err.message}`);
  }

  const slotKey = `Slot ${slot}`;
  // Ưu tiên profile đã từng gán cho đúng slot này và đang rảnh
  const idleProfile = existingProfiles.find(item => {
    const id = String(item.id || item.profile_id || '');
    if (!id || activeProfileIds.has(id)) return false;
    return String(item.name || '').includes(slotKey);
  }) || existingProfiles.find(item => {
    const id = String(item.id || item.profile_id || '');
    return Boolean(id) && !activeProfileIds.has(id);
  });

  if (idleProfile) {
    const idleId = String(idleProfile.id || idleProfile.profile_id);
    console.log(`[Multilogin] Tái sử dụng profile ${idleId} (${idleProfile.name || slotKey}) cho Slot ${slot}`);
    try {
      await updateMultiloginProfile(token, idleId, {
        name: profileRequest.name,
        parameters: profileRequest.parameters
      }, request);
    } catch (err) {
      console.warn(`[Multilogin] Cảnh báo khi cập nhật proxy profile ${idleId}: ${err.message}`);
    }
    return idleId;
  }

  console.log(`[Multilogin] Tạo profile Mimic mới cho Slot ${slot}...`);
  return createMultiloginProfile(token, profileRequest, request);
}
