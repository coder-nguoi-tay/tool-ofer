/**
 * Chỉ tạm chờ challenge thực sự đang chiếm trang; không bỏ form vì có script captcha nền.
 * @return {object} Tên trang và cờ challenge đang ngăn thao tác form.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectAutofillChallenge() {
  /**
   * Loại widget và field bị ẩn bởi chính nó hoặc tổ tiên.
   * @param {Element} element Phần tử cần kiểm tra.
   * @return {boolean} Phần tử còn hiển thị trong tài liệu hiện tại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const visible = element => {
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (ancestor.hidden || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const title = document.title || '';
  const text = `${title} ${(document.body?.innerText || '').slice(0, 200)}`;
  const challenge = Array.from(document.querySelectorAll('#challenge-form,#cf-chl-widget')).some(visible);
  const formFields = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]),textarea,select'));
  const hasForm = formFields.some(element => !element.disabled && !element.closest('#challenge-form,#cf-chl-widget') && visible(element));
  return { title, cf: !hasForm && (challenge || /just a moment/i.test(text)) };
}
