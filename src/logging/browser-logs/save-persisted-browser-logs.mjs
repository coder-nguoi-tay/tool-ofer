import { interactionLogDirectory } from './state/interaction-log-directory.mjs';
import { interactionLogFilePath } from './state/interaction-log-file-path.mjs';
import { persistedBrowserLogs } from './state/persisted-browser-logs.mjs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

let pendingSave = null;
let requestedRevision = 0;

/**
 * Gộp yêu cầu lưu đồng thời, mã hóa bản mới nhất khi tới lượt ghi và thay file nguyên tử.
 * Chỉ giữ một payload đang ghi, không tích nhiều bản JSON toàn bộ lịch sử trong RAM.
 * @return {Promise<boolean>} True khi dữ liệu đã ghi thành công, false khi ổ đĩa báo lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function savePersistedBrowserLogs() {
  requestedRevision++;
  if (pendingSave) return pendingSave;
  pendingSave = (async () => {
    let savedRevision;
    do {
      savedRevision = requestedRevision;
      const temporaryPath = `${interactionLogFilePath}.${randomUUID()}.tmp`;
      try {
        const content = JSON.stringify(persistedBrowserLogs);
        await mkdir(interactionLogDirectory, { recursive: true });
        await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
        await rename(temporaryPath, interactionLogFilePath);
      } catch (error) {
        console.error('Lỗi khi lưu browser-logs.json:', error.message);
        return false;
      } finally { await rm(temporaryPath, { force: true }).catch(() => {}); }
    } while (savedRevision !== requestedRevision);
    return true;
  })().finally(() => { pendingSave = null; });
  return pendingSave;
}
