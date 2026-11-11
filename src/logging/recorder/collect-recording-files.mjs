import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Liệt kê file JSONL và ảnh/HTML do recorder sở hữu; không đi theo symlink hoặc thư mục tùy ý.
 * @param {string} directory Thư mục logs của instance.
 * @return {Promise<object[]>} Đường dẫn, tên, dung lượng và thời điểm sửa của file thường.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function collectRecordingFiles(directory) {
  const files = [];
  /**
   * Thu file khớp mẫu trong một thư mục thực, bỏ qua symlink và file ngoài quyền sở hữu.
   * @param {string} folder Thư mục app quản lý.
   * @param {RegExp} pattern Mẫu tên file recorder.
   * @return {Promise<void>} Bổ sung metadata vào danh sách.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  async function collect(folder, pattern) {
    const info = await lstat(folder).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) return;
    for (const name of await readdir(folder)) {
      if (!pattern.test(name)) continue;
      const path = join(folder, name);
      const stat = await lstat(path).catch(() => null);
      if (stat?.isFile() && !stat.isSymbolicLink()) files.push({ path, name, size: stat.size, modifiedAt: stat.mtimeMs });
    }
  }
  await collect(directory, /^(manual-ops-[a-zA-Z0-9-]+\.jsonl|browser-logs\.json\.[a-f0-9-]+\.tmp)$/);
  const html = join(directory, 'html');
  const htmlInfo = await lstat(html).catch(() => null);
  if (htmlInfo?.isDirectory() && !htmlInfo.isSymbolicLink()) {
    await collect(html, /^offer\d+_[\w.-]+\.(html|jpg)$/);
    for (const name of await readdir(html)) if (/^offer-\d+$/.test(name)) await collect(join(html, name), /^offer\d+_[\w.-]+\.(html|jpg)$/);
  }
  return files;
}
