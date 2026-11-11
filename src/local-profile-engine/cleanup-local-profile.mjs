import { rm } from 'node:fs/promises';

/**
 * Dọn dẹp hoàn toàn thư mục profile cục bộ tạm khi phiên kết thúc.
 *
 * @param {string} profilePath Đường dẫn thư mục profile.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function cleanupLocalProfile(profilePath) {
  if (!profilePath || !profilePath.includes('.autoleadpc/Profiles/gologin_')) return;
  try {
    await rm(profilePath, {
      recursive: true,
      force: true
    });
  } catch (err) {
    console.warn(`[LocalProfileEngine] Không xóa được thư mục tạm ${profilePath}:`, err.message);
  }
}
export { cleanupLocalProfile };
