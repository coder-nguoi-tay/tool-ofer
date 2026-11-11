/**
 * PRNG xác định theo seed (mulberry32): cùng seed luôn ra cùng một máy.
 * @param {*} seed seed.
 * @return {*} Kết quả xử lý seeded random.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function seededRandom(seed) {
  let state = Number(seed) >>> 0 || 1;
  return () => {
    state = state + 0x6d2b79f5 >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export { seededRandom };
