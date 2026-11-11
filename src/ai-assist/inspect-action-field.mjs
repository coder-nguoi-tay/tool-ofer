/**
 * Nhận diện nghiệp vụ của field từ chính DOM thay vì dựa vào selector marker ngẫu nhiên.
 * @param {Element} element Control AI đang điền.
 * @return {object} Cờ email, địa chỉ và trạng thái chỉ đọc của field.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectActionField(element) {
  const field = element.matches('input, textarea, select') ? element : element.querySelector('input, textarea, select') || element;
  const identity = [field.type, field.id, field.name, field.placeholder, field.getAttribute('autocomplete')].join(' ');
  return { email: /email|mail/i.test(identity), address: /address|street/i.test(identity), readOnly: Boolean(field.readOnly) };
}
