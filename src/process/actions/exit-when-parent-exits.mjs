/**
 * Tự thoát khi tiến trình cha chết.
 *
 * AutoLeadPCMacApp.swift chạy node bằng Process không gắn pipe stdin, và terminate()
 * trong applicationWillTerminate không chạy khi app bị quit qua AppleScript, nên node
 * con sống sót và giữ cổng — lần mở app sau gặp EADDRINUSE. macOS re-parent con sang
 * launchd (pid 1) khi cha chết nên chỉ cần so ppid.
 *
 * LƯU Ý: ppid đổi (kể cả về 1) nghĩa là cha đã chết. Trước đây điều kiện `ppid <= 1`
 * bị hiểu ngược thành "vẫn ổn" nên node mồ côi sống mãi và giữ cổng 3211 — app mới
 * không bao giờ lên được cổng, giao diện lại nối vào bản code cũ.
 *
 * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function exitWhenParentExits() {
  if (process.env.AUTOLEADPC_NO_WATCHDOG === '1') return;
  const parentPid = process.ppid;
  if (parentPid <= 1) return;
  const watchdog = setInterval(() => {
    if (process.ppid === parentPid) return;
    console.error('Tiến trình cha đã thoát, đóng máy chủ giao diện.');
    process.exit(0);
  }, 2000);
  // Không để watchdog là thứ giữ process sống; máy chủ HTTP làm việc đó.
  watchdog.unref();
}
