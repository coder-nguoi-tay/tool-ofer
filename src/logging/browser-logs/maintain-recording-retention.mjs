import { interactionLogDirectory } from './state/interaction-log-directory.mjs';
import { persistedBrowserLogs } from './state/persisted-browser-logs.mjs';
import { browserSessionLogs } from './state/browser-session-logs.mjs';
import { pruneStoredRecordings } from '../recorder/prune-stored-recordings.mjs';
import { savePersistedBrowserLogs } from './save-persisted-browser-logs.mjs';

let nextMaintenanceAt = 0;
let maintenance = null;

/**
 * Kiểm tra lưu trữ tối đa một lần mỗi 10 phút, chỉ dọn file/phiên cũ không được bảo vệ.
 * @return {Promise<void>} Ghi metadata sau khi dọn, hoặc báo lỗi ngắn không chứa nội dung log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function maintainRecordingRetention() {
  if (maintenance) return maintenance;
  if (Date.now() < nextMaintenanceAt) return;
  nextMaintenanceAt = Date.now() + 600_000;
  maintenance = (async () => {
    try {
      const activeIds = new Set([...browserSessionLogs.keys()].map(session => session.recordingId));
      const result = await pruneStoredRecordings({ directory: interactionLogDirectory, sessions: persistedBrowserLogs, activeIds, persist: savePersistedBrowserLogs });
      if (result.removedFiles || result.removedSessions) console.log(`[RecorderRetention] sessions=${result.removedSessions} files=${result.removedFiles}`);
    } catch (error) { console.warn('[RecorderRetention] Không hoàn tất dọn log:', error.code || error.name); }
  })().finally(() => { maintenance = null; });
  return maintenance;
}
