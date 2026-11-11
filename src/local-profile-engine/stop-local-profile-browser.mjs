import { cleanupLocalProfile } from './cleanup-local-profile.mjs';

/**
 * Dừng trình duyệt và đợi tiến trình thoát trước khi xóa profile tạm.
 *
 * @param {import('node:child_process').ChildProcess} browserProcess Tiến trình Chrome của profile.
 * @param {string} profilePath Thư mục profile cần dọn.
 * @return {Promise<void>} Hoàn tất sau khi tiến trình thoát và profile được xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function stopLocalProfileBrowser(browserProcess, profilePath) {
  if (browserProcess && browserProcess.exitCode === null) {
    if (!browserProcess.killed) browserProcess.kill('SIGTERM');
    await Promise.race([new Promise(resolve => browserProcess.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (browserProcess.exitCode === null) browserProcess.kill('SIGKILL');
  }
  await cleanupLocalProfile(profilePath);
}
export { stopLocalProfileBrowser };
