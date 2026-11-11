import { executeFile } from './state/execute-file.mjs';
import { interactionHtmlDirectory } from './state/interaction-html-directory.mjs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

/**
 * Mở thư mục HTML đã lưu trong Finder.
 * @param {number|string|null} offerNumber Offer cần mở hoặc toàn bộ.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function openLogsHtmlDirectoryInFinder(offerNumber = null) {
  let targetDir = interactionHtmlDirectory;
  if (offerNumber && offerNumber !== 'all') {
    const sub = join(interactionHtmlDirectory, `offer-${offerNumber}`);
    await mkdir(sub, {
      recursive: true
    });
    targetDir = sub;
  } else {
    await mkdir(targetDir, {
      recursive: true
    });
  }
  await executeFile('open', [targetDir]);
}
export { openLogsHtmlDirectoryInFinder };
