/**
 * Xóa một profile GoLogin qua REST API.
 *
 * @param {string} token API token GoLogin.
 * @param {string} profileId ID profile cần xóa.
 * @param {typeof fetch} [request=fetch] Hàm fetch.
 * @return {Promise<boolean>} True khi GoLogin xác nhận đã xóa; lỗi mạng/HTTP trả false để phiên ghi log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function deleteGoLoginProfile(token, profileId, request = fetch) {
  if (!token || !profileId) return false;
  const response = await request(`https://api.gologin.com/browser/${profileId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    signal: AbortSignal.timeout(20000)
  }).catch(() => null);
  return Boolean(response?.ok);
}
