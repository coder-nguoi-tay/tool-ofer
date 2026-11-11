/**
 * Select by text.
 * @param {*} loc loc.
 * @param {string} text text.
 * @return {Promise<void>} Kết quả xử lý select by text.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function selectByText(loc, text) {
  await loc.selectOption({
    label: text
  }, {
    timeout: 5000
  }).catch(() => loc.selectOption({
    label: new RegExp(text, 'i')
  }, {
    timeout: 5000
  }).catch(() => {}));
}
export { selectByText };
