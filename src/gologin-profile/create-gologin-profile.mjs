/**
 * Tạo một profile GoLogin mới qua REST API.
 *
 * @param {string} token API token GoLogin.
 * @param {object} profileRequest Payload profile đã dựng.
 * @param {typeof fetch} [request=fetch] Hàm fetch.
 * @return {Promise<string>} Profile ID vừa tạo.
 * @throws {Error} Khi API trả lỗi hoặc không thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function createGoLoginProfile(token, profileRequest, request = fetch) {
  if (!token) throw new Error('Thiếu GoLogin API Token.');
  const response = await request('https://api.gologin.com/browser/custom', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify(profileRequest)
  });

  if (!response.ok) {
    // 403 khi tài khoản đã đủ số profile tối đa của gói (profile phiên trước chưa xóa hoặc chạy quá số profile gói cho phép).
    throw Object.assign(new Error(`Tạo profile GoLogin thất bại (HTTP ${response.status}).`),
      { code: response.status === 403 ? 'GOLOGIN_PROFILE_LIMIT' : `GOLOGIN_HTTP_${response.status}` });
  }

  const data = await response.json();
  const profileId = data?.id;
  if (!profileId) throw new Error('GoLogin API không trả về ID profile hợp lệ.');
  return profileId;
}
