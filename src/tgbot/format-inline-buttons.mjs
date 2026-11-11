/**
 * Format inline buttons.
 * @param {*} buttons buttons.
 * @return {*} Kết quả xử lý format inline buttons.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function formatInlineButtons(buttons) {
  if (!buttons?.length) return null;
  return buttons.map(row => row.map(b => {
    if (b.web_app) return {
      text: b.text,
      web_app: b.web_app
    };
    if (b.url) return {
      text: b.text,
      url: b.url
    };
    return {
      text: b.text,
      callback_data: b.cb
    };
  }));
}
export { formatInlineButtons };
