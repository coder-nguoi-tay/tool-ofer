import { browserSessionLogs } from './state/browser-session-logs.mjs';
import { existsSync } from 'node:fs';
import { interactionHtmlDirectory } from './state/interaction-html-directory.mjs';
import { interactionLogFilePath } from './state/interaction-log-file-path.mjs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { persistedBrowserLogs } from './state/persisted-browser-logs.mjs';
import { rm } from 'node:fs/promises';
import { savePersistedBrowserLogs } from './save-persisted-browser-logs.mjs';
import { setPersistedBrowserLogs } from './state/persisted-browser-logs.mjs';

/**
 * Xoá log và HTML đã lưu của một offer hoặc toàn bộ.
 * @param {number|string|null} offerNumber Offer cần xoá hoặc toàn bộ.
 * @return {Promise<object>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function clearAllLogsAndHtml(offerNumber = null) {
  try {
    for (const storedSession of persistedBrowserLogs) {
      if (!offerNumber || offerNumber === 'all' || String(storedSession.offer || 1) === String(offerNumber)) storedSession.feedback?.splice(0);
    }
    if (offerNumber && offerNumber !== 'all') {
      const oStr = String(offerNumber);
      setPersistedBrowserLogs(persistedBrowserLogs.filter(s => String(s.offer || 1) !== oStr));
      for (const [session, logs] of browserSessionLogs.entries()) {
        if (String(session.offerNumber ?? session.streamRole ?? 1) === oStr) {
          logs.length = 0;
        }
      }
      const sub = join(interactionHtmlDirectory, `offer-${offerNumber}`);
      if (existsSync(sub)) {
        await rm(sub, {
          recursive: true,
          force: true
        }).catch(() => {});
      }
      await savePersistedBrowserLogs();
      return {
        success: true,
        message: `Đã xóa log và file HTML của Offer ${offerNumber}.`
      };
    }
    await rm(interactionHtmlDirectory, {
      recursive: true,
      force: true
    });
    await mkdir(interactionHtmlDirectory, {
      recursive: true
    });
    await rm(interactionLogFilePath, {
      force: true
    }).catch(() => {});
    setPersistedBrowserLogs([]);
    for (const logs of browserSessionLogs.values()) {
      logs.length = 0;
    }
    await savePersistedBrowserLogs();
    return {
      success: true,
      message: 'Đã xóa toàn bộ log và các file HTML đã lưu.'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
export { clearAllLogsAndHtml };
