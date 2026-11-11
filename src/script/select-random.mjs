import { randInt } from './rand-int.mjs';

/**
 * Select random.
 * @param {*} loc loc.
 * @return {Promise<void>} Kết quả xử lý select random.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function selectRandom(loc) {
  const count = await loc.locator('option').count().catch(() => 0);
  if (count < 2) return;
  await loc.selectOption({
    index: randInt(1, count - 1)
  }, {
    timeout: 5000
  }).catch(() => {});
}
export { selectRandom };
