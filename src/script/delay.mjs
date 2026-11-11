/**
 * Delay.
 * @param {*} ms ms.
 * @return {Promise<void>} Kết quả xử lý delay.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function delay(ms) {
  if (ms > 0) await new Promise(r => setTimeout(r, ms));
}
export { delay };
