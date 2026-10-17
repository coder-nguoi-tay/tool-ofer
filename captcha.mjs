import { request as httpsRequest, get as httpsGet } from 'node:https';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('2captcha: timeout kết nối')); });
  });
}

function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body);
    const req = httpsRequest(
      { hostname, path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': bodyBuf.length } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

async function poll(taskId, apiKey, maxWaitMs = 120000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const result = await get(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}`);
    if (result.startsWith('OK|')) return result.slice(3).trim();
    if (result !== 'CAPCHA_NOT_READY') throw new Error(`2captcha lỗi khi lấy kết quả: ${result}`);
  }
  throw new Error('2captcha: hết thời gian chờ (120s)');
}

/**
 * Giải reCAPTCHA v2 qua 2captcha.
 * @param {string} siteKey data-sitekey trên trang
 * @param {string} pageUrl URL của trang đang mở
 * @param {string} apiKey API key 2captcha
 * @returns {Promise<string>} token để điền vào g-recaptcha-response
 */
export async function solveReCaptcha(siteKey, pageUrl, apiKey) {
  const qs = `key=${apiKey}&method=userrecaptcha&googlekey=${encodeURIComponent(siteKey)}&pageurl=${encodeURIComponent(pageUrl)}`;
  const response = await post('2captcha.com', '/in.php', qs);
  if (!response.startsWith('OK|')) throw new Error(`2captcha submit lỗi: ${response}`);
  return poll(response.slice(3).trim(), apiKey);
}

/**
 * Giải captcha hình ảnh qua 2captcha.
 * @param {string} base64Image ảnh captcha dưới dạng base64
 * @param {string} apiKey API key 2captcha
 * @returns {Promise<string>} văn bản đọc được từ ảnh
 */
export async function solveImageCaptcha(base64Image, apiKey) {
  const qs = `key=${apiKey}&method=base64&body=${encodeURIComponent(base64Image)}`;
  const response = await post('2captcha.com', '/in.php', qs);
  if (!response.startsWith('OK|')) throw new Error(`2captcha submit lỗi: ${response}`);
  return poll(response.slice(3).trim(), apiKey);
}
