import { spawn } from 'node:child_process';

/**
 * Copy nguyên chuỗi HTML vào clipboard hệ thống (macOS pbcopy).
 *
 * @param {string} html Nội dung HTML cần copy.
 * @return {Promise<boolean>} true nếu copy thành công.
 * @throws {never} Mọi lỗi đều được nuốt và trả về false.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function copyHtmlToClipboard(html) {
  return new Promise(resolve => {
    if (!html || process.platform !== 'darwin') {
      resolve(false);
      return;
    }
    try {
      const child = spawn('pbcopy');
      child.on('error', () => resolve(false));
      child.on('close', code => resolve(code === 0));
      child.stdin.on('error', () => resolve(false));
      child.stdin.end(html, 'utf8');
    } catch {
      resolve(false);
    }
  });
}
export { copyHtmlToClipboard };
