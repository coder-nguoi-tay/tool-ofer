import { executeFile } from './state/execute-file.mjs';
import { interactionHtmlDirectory } from './state/interaction-html-directory.mjs';
import { interactionLogDirectory } from './state/interaction-log-directory.mjs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { savePersistedBrowserLogs } from './save-persisted-browser-logs.mjs';
import { tmpdir } from 'node:os';
import { browserSessionLogs } from './state/browser-session-logs.mjs';

/**
 * Ghi nốt lô debug đang chờ rồi đóng gói log, HTML và ảnh để người dùng tải xuống.
 *
 * @return {Promise<Buffer>} Nội dung ZIP chứa lịch sử giao diện đã lưu.
 * @throws {Error} Khi không thể tạo hoặc đọc tệp ZIP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function createBrowserLogsArchive() {
  await Promise.all([...browserSessionLogs.keys()].map(session => session.flushRecorderLogs?.()));
  await mkdir(interactionHtmlDirectory, {
    recursive: true
  });
  if (!await savePersistedBrowserLogs()) throw new Error('Không lưu được nhật ký trước khi xuất ZIP.');
  const actionFiles = (await readdir(interactionLogDirectory)).filter(name => /^manual-ops-[a-zA-Z0-9-]+\.jsonl$/.test(name));
  const archivePath = join(tmpdir(), `autoleadpc-interfaces-${randomUUID()}.zip`);
  try {
    await executeFile('zip', ['-q', '-r', archivePath, 'browser-logs.json', 'html', ...actionFiles], {
      cwd: interactionLogDirectory,
      maxBuffer: 10 * 1024 * 1024
    });
    return await readFile(archivePath);
  } finally {
    await rm(archivePath, {
      force: true
    }).catch(() => {});
  }
}
export { createBrowserLogsArchive };
