import { baseDataDirectory } from '../../config/paths.mjs';
import { chromeProfileCacheDirectory } from '../chrome-paths.mjs';
import { chromeProfileDirectory } from '../chrome-paths.mjs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute, sep } from 'node:path';

/**
 * Chỉ cho phép xoá thư mục nằm trong kho profile do app quản lý.
 *
 * Chặn cửa trước cho một lệnh `rm -r`: chỉ nhận đường dẫn trong kho profile hoặc trong cây
 * cache song song của nó ở `~/Library/Caches/AutoLeadPC/chrome-profiles`; có `..` là từ chối,
 * nên một giá trị sai không thể xoá thứ khác trên máy.
 *
 * @param {string} candidate Đường dẫn cần kiểm tra.
 * @return {boolean} True khi đường dẫn nằm trong kho profile của app.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function isManagedChromeProfilePath(candidate) {
  if (typeof candidate !== 'string' || candidate.includes('..')) return false;
  const roots = [chromeProfileDirectory, chromeProfileCacheDirectory, join(baseDataDirectory, 'chrome-profiles'), join(homedir(), 'Library', 'Caches', 'AutoLeadPC', 'chrome-profiles')];
  return roots.some(root => {
    const childPath = relative(root, candidate);
    return childPath !== '' && childPath !== '..' && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath);
  });
}
export { isManagedChromeProfilePath };
