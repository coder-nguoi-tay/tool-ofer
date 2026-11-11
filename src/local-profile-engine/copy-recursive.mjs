import { cp } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';

/**
 * Sao chép thư mục đệ quy sang vị trí mới.
 *
 * @param {string} source Thư mục nguồn.
 * @param {string} destination Thư mục đích.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function copyRecursive(source, destination) {
  await mkdir(destination, {
    recursive: true,
    mode: 0o700
  });
  await cp(source, destination, {
    recursive: true
  });
}
export { copyRecursive };
