/**
 * Chỉ cho phép tên file cấu hình đơn giản (không thư mục, không ".."): các endpoint /pc/config và
 * /pc/browser-config ghép thẳng body.file vào đường dẫn nên trước đây đọc/ghi được file bất kỳ trên máy.
 *
 * @param {string} name Tên file do giao diện gửi lên.
 * @return {string} Tên file an toàn.
 * @throws {Error} Khi tên file không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function safeConfigFileName(name) {
  const fileName = String(name ?? '');
  if (!/^[\w .-]+$/.test(fileName) || fileName.includes('..')) throw new Error('Tên file cấu hình không hợp lệ');
  return fileName;
}
