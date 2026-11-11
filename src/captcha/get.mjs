import { get as httpsGet } from 'node:https';

/**
 * Get.
 * @param {string} url url.
 * @return {*} Kết quả xử lý get.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function get(url) {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('2captcha: timeout kết nối'));
    });
  });
}
export { get };
