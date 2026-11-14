import { deleteGoLoginProfile } from './delete-gologin-profile.mjs';

/**
 * Xóa mọi profile do AutoLeadPC tạo (ghi chú bắt đầu "AutoLeadPC Mac •"), không đụng profile khác trên tài khoản.
 * ponytail: nhận theo ghi chú chung, nếu nhiều máy/app dùng chung token GoLogin thì cần thêm mã instance vào ghi chú.
 * @param {string} token API token GoLogin.
 * @param {Set<string>} [keepProfileIds] Profile đang dùng, không được xóa.
 * @param {typeof fetch} [request=fetch] Hàm gọi API, thay bằng mock khi test.
 * @return {Promise<{deleted: number, failed: number}>} Số profile đã xóa và xóa lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function deleteAppGoLoginProfiles(token, keepProfileIds = new Set(), request = fetch) {
  if (!token) return { deleted: 0, failed: 0 };
  const response = await request('https://api.gologin.com/browser/v2', {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  if (!response?.ok) return { deleted: 0, failed: 0 };
  const { profiles = [] } = await response.json().catch(() => ({}));
  const targets = profiles.filter(profile => String(profile.notes || '').startsWith('AutoLeadPC Mac •') && !keepProfileIds.has(profile.id));
  const results = await Promise.all(targets.map(profile => deleteGoLoginProfile(token, profile.id, request)));
  return { deleted: results.filter(Boolean).length, failed: results.filter(ok => !ok).length };
}
