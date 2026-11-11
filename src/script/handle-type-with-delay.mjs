/**
 * Nhập văn bản kèm tốc độ gõ (delayMs giữa các phím).
 * @param {*} loc loc.
 * @param {*} value value.
 * @param {number} delayMs delay ms.
 * @return {Promise<void>} Kết quả xử lý handle type with delay.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleTypeWithDelay(loc, value, delayMs = 0) {
  if ((await loc.count().catch(() => 0)) === 0) return;
  await loc.scrollIntoViewIfNeeded({
    timeout: 2000
  }).catch(() => {});
  const ms = parseInt(delayMs, 10) || 0;
  if (ms > 0) {
    await loc.fill('').catch(() => {});
    await loc.type(String(value), {
      delay: ms
    }).catch(() => {});
  } else {
    await loc.fill(String(value), {
      timeout: 5000
    }).catch(async () => {
      await loc.type(String(value), {
        delay: 20
      }).catch(() => {});
    });
  }
}
export { handleTypeWithDelay };
