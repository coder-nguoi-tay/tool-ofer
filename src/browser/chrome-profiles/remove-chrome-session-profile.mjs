import { access } from 'node:fs/promises';
import { chromeProfileCacheDirectory } from '../chrome-paths.mjs';
import { chromeProfileDirectory } from '../chrome-paths.mjs';
import { isManagedChromeProfilePath } from './is-managed-chrome-profile-path.mjs';
import { rm } from 'node:fs/promises';

/**
 * Xoá thư mục profile của một phiên sau khi cửa sổ Chrome đã đóng.
 *
 * Mỗi profile là một bản chép đầy đủ của profile mẫu (~179 MB) nên để lại là đĩa phình
 * thêm bấy nhiêu cho mỗi proxy từng thử. Chờ một nhịp cho Chrome ghi xong rồi mới xoá, và
 * thử lại một lần vì Chrome có thể tạo lại file ngay sau lần xoá đầu.
 *
 * @param {string} userDataDirectory Thư mục profile cần xoá.
 * @return {Promise<void>} Hoàn tất khi đã xoá hoặc bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function removeChromeSessionProfile(userDataDirectory) {
  // Chrome giữ cache ở cây song song trong ~/Library/Caches, xoá profile mà bỏ cache thì
  // cache vẫn tích lại từng lượt.
  const targets = [userDataDirectory, userDataDirectory.replace(chromeProfileDirectory, chromeProfileCacheDirectory)].filter(target => isManagedChromeProfilePath(target));
  // Thử xóa ngay, sau đó retry nếu Chrome chưa nhả file
  for (const delayMs of [0, 1500, 2500, 10000]) {
    if (delayMs > 0) await new Promise(resolve => {
      setTimeout(resolve, delayMs);
    });
    await Promise.all(targets.map(target => rm(target, {
      recursive: true,
      force: true
    }).catch(() => {})));
    const remaining = await Promise.all(targets.map(target => access(target).then(() => true, () => false)));
    if (!remaining.includes(true)) return;
  }
}
export { removeChromeSessionProfile };
