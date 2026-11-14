/**
 * Cập nhật cấu hình profile GoLogin có sẵn.
 *
 * @param {string} token API token GoLogin.
 * @param {string} profileId ID profile cần cập nhật.
 * @param {object} profileRequest Cấu hình mới (proxy, UA, OS, name).
 * @param {typeof fetch} [request=fetch] Hàm fetch.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function updateGoLoginProfile(token, profileId, profileRequest, request = fetch) {
  if (!token) throw new Error('Thiếu GoLogin API Token.');
  if (!profileId) throw new Error('Thiếu ID profile GoLogin.');

  const response = await request(`https://api.gologin.com/browser/${profileId}/custom`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify(profileRequest)
  });

  if (!response.ok) {
    throw new Error(`Cập nhật profile GoLogin ${profileId} thất bại (${response.status}).`);
  }
}
