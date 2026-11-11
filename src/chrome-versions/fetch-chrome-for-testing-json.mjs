import { chromeForTestingBaseUrl } from './state/chrome-for-testing-base-url.mjs';

/**
 * Gọi một file JSON của Chrome for Testing.
 *
 * @param {string} fileName Tên file trong endpoint Chrome for Testing.
 * @return {Promise<object>} Nội dung JSON đã phân tích.
 * @throws {Error} Khi Google trả về lỗi hoặc nội dung không phải JSON.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchChromeForTestingJson(fileName) {
  const response = await fetch(chromeForTestingBaseUrl + '/' + fileName, {
    redirect: 'follow'
  });
  if (!response.ok) {
    throw new Error('Không đọc được danh mục Chrome for Testing: HTTP ' + response.status + '.');
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Danh mục Chrome for Testing trả về dữ liệu không phải JSON.');
  }
}
export { fetchChromeForTestingJson };
