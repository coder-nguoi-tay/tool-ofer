import { requestAdsPower } from './request-ads-power.mjs';

/**
 * Cập nhật cấu hình proxy và tên cho một profile AdsPower đã có sẵn (không tốn quota tạo mới).
 *
 * @param {string} apiKey Khóa Local API.
 * @param {string} profileId ID profile AdsPower.
 * @param {object} options Các trường cần cập nhật (name, user_proxy_config, tabs).
 * @param {typeof fetch} [request=fetch] Hàm fetch.
 * @return {Promise<object>} Kết quả cập nhật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function updateAdsPowerProfile(apiKey, profileId, options = {}, request = fetch) {
  const payload = {
    user_id: profileId,
    ...(options.name ? {
      name: options.name
    } : {}),
    ...(options.user_proxy_config ? {
      user_proxy_config: options.user_proxy_config
    } : {}),
    ...(options.tabs ? {
      tabs: options.tabs
    } : {}),
    ...(options.fingerprint_config ? {
      fingerprint_config: options.fingerprint_config
    } : {})
  };
  return requestAdsPower(apiKey, '/api/v1/user/update', payload, request);
}
export { updateAdsPowerProfile };
