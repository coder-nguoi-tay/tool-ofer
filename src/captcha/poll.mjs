import { get } from './get.mjs';

/**
 * Poll.
 * @param {*} taskId task id.
 * @param {*} apiKey api key.
 * @param {number} maxWaitMs max wait ms.
 * @return {Promise<*>} Kết quả xử lý poll.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function poll(taskId, apiKey, maxWaitMs = 120000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const result = await get(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}`);
    if (result.startsWith('OK|')) return result.slice(3).trim();
    if (result !== 'CAPCHA_NOT_READY') throw new Error(`2captcha lỗi khi lấy kết quả: ${result}`);
  }
  throw new Error('2captcha: hết thời gian chờ (120s)');
}
export { poll };
