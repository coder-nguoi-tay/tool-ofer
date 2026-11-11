/**
 * Select by index.
 * @param {*} loc loc.
 * @param {*} idx idx.
 * @return {Promise<void>} Kết quả xử lý select by index.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function selectByIndex(loc, idx) {
  const count = await loc.locator('option').count().catch(() => 0);
  if (count === 0) return;
  const safeIdx = Math.min(Math.max(0, Number(idx) || 0), count - 1);
  await loc.selectOption({
    index: safeIdx
  }, {
    timeout: 5000
  }).catch(() => {});
}
export { selectByIndex };
