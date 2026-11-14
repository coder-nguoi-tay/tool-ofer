/**
 * Đổi tên profile GoLogin (vd. ghi đúng IP app đã xác minh trong Orbita) qua PATCH /browser/{id}/name.
 * @param {string} token API token GoLogin.
 * @param {string} profileId ID profile.
 * @param {string} name Tên mới.
 * @param {typeof fetch} [request=fetch] Hàm gọi API, thay bằng mock khi test.
 * @return {Promise<boolean>} True khi GoLogin nhận tên mới.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function renameGoLoginProfile(token, profileId, name, request = fetch) {
  const response = await request(`https://api.gologin.com/browser/${profileId}/name`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  return Boolean(response?.ok);
}
