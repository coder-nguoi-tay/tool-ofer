/**
 * Dừng đúng tiến trình Orbita do instance SDK hiện tại sinh ra, không dùng pkill toàn máy.
 * @param {object|null} child ChildProcess được GoLogin lưu trong processSpawned.
 * @return {Promise<void>} Tiến trình đã thoát hoặc chưa từng được tạo.
 * @throws {Error} Khi tiến trình vẫn sống sau SIGTERM và SIGKILL.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function stopGoLoginBrowserProcess(child) {
  if (!child?.pid) return;
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    const deadline = Date.now() + 5000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (child.exitCode === null && child.signalCode === null) throw new Error('Chưa dừng được tiến trình Orbita thuộc profile này.');
}
