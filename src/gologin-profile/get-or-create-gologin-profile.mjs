import { createGoLoginProfile } from './create-gologin-profile.mjs';
import { updateGoLoginProfile } from './update-gologin-profile.mjs';
import { reservedGoLoginProfileIds } from './profile-reservations.mjs';

/**
 * Chỉ tái sử dụng profile AutoLeadPC có bằng chứng đã dừng; giữ chỗ trước khi cập nhật.
 * @param {string} token Token do người dùng cấu hình.
 * @param {object} profileRequest Cấu hình proxy/fingerprint mới.
 * @param {Set<string>} activeProfileIds Profile đang dùng trong lượt mở hiện tại.
 * @param {number} slot Slot đang được cấp profile.
 * @param {typeof fetch} request Hàm gọi API, có thể thay bằng mock offline.
 * @return {Promise<string>} ID profile đã giữ chỗ và cập nhật thành công.
 * @throws {Error} Khi API liệt kê/tạo/cập nhật thất bại; không chạy cấu hình cũ.
 * @deprecated Launcher đã chuyển sang tạo profile mới mỗi phiên và xóa khi đóng (createGoLoginProfile).
 *   API /browser/v2 không trả status/isRunning nên điều kiện tái sử dụng không bao giờ khớp. Chờ duyệt để xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function getOrCreateGoLoginProfile(token, profileRequest, activeProfileIds = new Set(), slot = 1, request = fetch) {
  const response = await request('https://api.gologin.com/browser/v2', {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Không liệt kê được profile GoLogin (HTTP ${response.status}).`);
  const data = await response.json();
  const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
  const available = profiles.filter(profile =>
    String(profile.notes || '').startsWith('AutoLeadPC Mac •') &&
    (profile.status === 'stopped' || profile.isRunning === false) &&
    (!profileRequest.os || profile.os === profileRequest.os && (profile.osSpec || '') === (profileRequest.osSpec || '')) &&
    !activeProfileIds.has(profile.id) && !reservedGoLoginProfileIds.has(profile.id));
  const profile = available.find(item => item.name?.startsWith(`Slot ${slot} •`)) || available[0];
  if (profile) {
    reservedGoLoginProfileIds.add(profile.id);
    activeProfileIds.add(profile.id);
    try {
      await updateGoLoginProfile(token, profile.id, profileRequest, request);
      return profile.id;
    } catch (error) {
      reservedGoLoginProfileIds.delete(profile.id);
      activeProfileIds.delete(profile.id);
      throw error;
    }
  }
  const profileId = await createGoLoginProfile(token, profileRequest, request);
  reservedGoLoginProfileIds.add(profileId);
  activeProfileIds.add(profileId);
  return profileId;
}
