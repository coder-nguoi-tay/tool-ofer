import { emailQueue } from './state/email-queue.mjs';
import { homedir } from 'node:os';
import { importEmailLines } from './import-email-lines.mjs';
import { join } from 'node:path';
import { loadEmailQueue } from './load-email-queue.mjs';
import { readFile } from 'node:fs/promises';
import { saveEmailQueue } from './save-email-queue.mjs';

/**
 * Khởi tạo email queue: nếu trống, tự động nạp từ các file mẫu có sẵn trên máy.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function initializeEmailQueue() {
  await loadEmailQueue();
  if (emailQueue.available.length === 0 && emailQueue.used.length === 0) {
    const defaultCandidates = [join(homedir(), 'Downloads', '1kpart2.txt'), join(homedir(), 'Downloads', 'AutoLeadPC', 'Text', 'Gmail.txt')];
    for (const cand of defaultCandidates) {
      try {
        const text = await readFile(cand, 'utf8');
        const lines = text.split(/\r?\n/);
        const added = importEmailLines(lines);
        if (added > 0) {
          console.log(`[EmailQueue] Đã tự động nạp ${added} email từ ${cand}`);
          await saveEmailQueue();
          break;
        }
      } catch {}
    }
  }
}
export { initializeEmailQueue };
