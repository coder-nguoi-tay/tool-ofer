import { LOCAL_API_ADDRESS } from './state/local-api-address.mjs';

/**
 * Gửi yêu cầu tới Local API AdsPower và trả dữ liệu khi thao tác thành công.
 *
 * @param {string} apiKey Khóa Local API trong AdsPower.
 * @param {string} path Đường dẫn API V2.
 * @param {object} payload Dữ liệu của thao tác profile.
 * @param {typeof fetch} request Hàm HTTP để thử nghiệm không cần tài khoản thật.
 * @return {Promise<object>} Trường data của phản hồi AdsPower.
 * @throws {Error} Khi thiếu API key, AdsPower chưa chạy hoặc từ chối thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function requestAdsPower(apiKey, path, payload = null, request = fetch) {
  if (!apiKey) throw new Error('Nhập AdsPower API key trong Settings > Browser.');
  let response;
  const isGet = payload === null || payload === undefined;
  try {
    response = await request(`${LOCAL_API_ADDRESS}${path}`, {
      method: isGet ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(isGet ? {} : {
          'Content-Type': 'application/json'
        })
      },
      ...(isGet ? {} : {
        body: JSON.stringify(payload)
      }),
      signal: AbortSignal.timeout(45_000)
    });
  } catch (error) {
    throw new Error(`Không kết nối được AdsPower Local API tại ${LOCAL_API_ADDRESS}: ${error.message}`);
  }
  let result = await response.json().catch(() => null);
  if (result?.code === -1 && String(result?.msg).includes('Too many request')) {
    await new Promise(resolve => setTimeout(resolve, 1100));
    try {
      response = await request(`${LOCAL_API_ADDRESS}${path}`, {
        method: isGet ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(isGet ? {} : {
            'Content-Type': 'application/json'
          })
        },
        ...(isGet ? {} : {
          body: JSON.stringify(payload)
        }),
        signal: AbortSignal.timeout(45_000)
      });
      result = await response.json().catch(() => null);
    } catch {
      // ignore retry network error
    }
  }
  if (!response.ok || result?.code !== 0 && result?.code !== undefined) {
    throw new Error(`AdsPower ${path} lỗi: ${result?.msg || `HTTP ${response.status}`}`);
  }
  return result.data ?? {};
}
export { requestAdsPower };
