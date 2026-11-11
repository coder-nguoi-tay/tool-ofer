import { interactionHtmlDirectory } from './state/interaction-html-directory.mjs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';

/**
 * Đếm các bản HTML đã lưu theo offer.
 * @return {Promise<number>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function countSavedHtmlFiles() {
  try {
    await mkdir(interactionHtmlDirectory, {
      recursive: true
    });
    const entries = await readdir(interactionHtmlDirectory, {
      withFileTypes: true
    });
    let count = 0;
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith('.html')) count++;else if (ent.isDirectory()) {
        try {
          const subFiles = await readdir(join(interactionHtmlDirectory, ent.name));
          count += subFiles.filter(f => f.endsWith('.html')).length;
        } catch {}
      }
    }
    return count;
  } catch {
    return 0;
  }
}
export { countSavedHtmlFiles };
