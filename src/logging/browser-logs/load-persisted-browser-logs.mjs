import { interactionHtmlDirectory } from './state/interaction-html-directory.mjs';
import { interactionLogFilePath } from './state/interaction-log-file-path.mjs';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { setPersistedBrowserLogs } from './state/persisted-browser-logs.mjs';
import { maintainRecordingRetention } from './maintain-recording-retention.mjs';

/**
 * Nạp lịch sử và áp dụng lưu trữ có giới hạn cho các phiên cũ không được bảo vệ.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function loadPersistedBrowserLogs() {
  try {
    await mkdir(interactionHtmlDirectory, {
      recursive: true
    });
    const raw = await readFile(interactionLogFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      setPersistedBrowserLogs(parsed);
    }
  } catch {
    setPersistedBrowserLogs([]);
  }
  await maintainRecordingRetention();
}
export { loadPersistedBrowserLogs };
