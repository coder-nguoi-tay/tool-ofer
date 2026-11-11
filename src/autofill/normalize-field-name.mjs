/**
 * Chuẩn hóa tên cột và nhãn trên form để ghép đúng trường.
 *
 * @param {string} name Tên cột hoặc nhãn trường.
 * @return {string} Tên so khớp không dấu và không ký tự phân cách.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function normalizeFieldName(name) {
  return String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
export { normalizeFieldName };
