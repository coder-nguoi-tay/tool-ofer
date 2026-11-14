import { shutdownGoLoginSessions } from './shutdown-gologin-sessions.mjs';
import { savePersistedBrowserLogs } from '../../logging/browser-logs.mjs';

let shutdown = null;

/**
 * Tắt server một lần: nhả cổng giao diện ngay, dừng Orbita/xóa profile GoLogin (tối đa 20 giây), lưu nhật ký rồi thoát.
 * @param {string} reason Lý do tắt (tín hiệu hoặc app cha đã thoát).
 * @param {object|null} server Máy chủ HTTP cần đóng để lần mở app sau dùng được cổng ngay.
 * @return {Promise<void>} Kết thúc bằng process.exit(0).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function shutdownAppGracefully(reason, server = null) {
  shutdown ||= (async () => {
    server?.close();
    console.log(`[Shutdown] ${reason}: dừng Orbita và xóa profile GoLogin…`);
    // ponytail: chờ tối đa 20 giây; mạng GoLogin treo thì thoát luôn, lần mở app sau sẽ quét profile sót.
    const result = await Promise.race([shutdownGoLoginSessions().catch(() => null), new Promise(resolve => setTimeout(resolve, 20000, null))]);
    console.log(result ? `[Shutdown] Đã dừng ${result.stopped} phiên, xóa thêm ${result.deleted} profile sót.` : '[Shutdown] Hết thời gian dọn GoLogin.');
    await savePersistedBrowserLogs().catch(() => {});
    process.exit(0);
  })();
  return shutdown;
}
