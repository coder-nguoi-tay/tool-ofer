/**
 * Select by value.
 * @param {*} loc loc.
 * @param {*} value value.
 * @return {Promise<void>} Kết quả xử lý select by value.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function selectByValue(loc, value) {
  await loc.selectOption({
    value
  }, {
    timeout: 5000
  }).catch(() => loc.selectOption({
    label: new RegExp(value, 'i')
  }, {
    timeout: 5000
  }).catch(() => {}));
}
export { selectByValue };
