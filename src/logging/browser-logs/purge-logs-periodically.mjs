import { LOG_PURGE_INTERVAL_MS } from './state/log-purge-interval-ms.mjs';
import { clearAllLogsAndHtml } from './clear-all-logs-and-html.mjs';
import { purgeFullHtmlCaptures } from '../html-capture.mjs';

/**
 * Xoá log định kỳ: log trình duyệt + file HTML đã lưu (như nút "Xóa log"), và file chụp HTML trong
 * offer-html-full (xoá file cũ, làm rỗng file đang ghi) để ổ đĩa không phình (đã từng lên 9,7 GB).
 *
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function purgeLogsPeriodically() {
  await clearAllLogsAndHtml().catch(() => {});
  await purgeFullHtmlCaptures();
  console.log(`[LogCleanup] Đã xoá log trình duyệt, file HTML và file chụp HTML (chu kỳ ${LOG_PURGE_INTERVAL_MS / 60000} phút).`);
}
export { purgeLogsPeriodically };
