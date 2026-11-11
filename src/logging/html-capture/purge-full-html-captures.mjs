import { OFFER_HTML_FULL_DIR } from './state/offer-html-full-dir.mjs';
import { OFFER_HTML_FULL_LOG } from './state/offer-html-full-log.mjs';
import { join } from 'node:path';
import { moduleState } from './state/module-state.mjs';
import { readdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';

/**
 * Xoá các file chụp HTML cũ và làm rỗng file hiện tại theo đúng hàng đợi ghi.
 * @return {Promise<void>} Hoàn tất khi các file cũ đã được xử lý và yêu cầu làm rỗng đã xếp hàng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function purgeFullHtmlCaptures() {
  const files = await readdir(OFFER_HTML_FULL_DIR).catch(() => []);
  for (const name of files) {
    const filePath = join(OFFER_HTML_FULL_DIR, name);
    if (name.endsWith('.jsonl') && filePath !== OFFER_HTML_FULL_LOG) await rm(filePath, {
      force: true
    }).catch(() => {});
  }
  // Xếp sau các lượt ghi đang chờ để không cắt ngang một bản HTML.
  moduleState.fullHtmlWriteChain = moduleState.fullHtmlWriteChain.then(() => writeFile(OFFER_HTML_FULL_LOG, '')).catch(() => {});
}
export { purgeFullHtmlCaptures };
