import { activeBrowsers } from '../../browser/sessions.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { requestManagedProfileStop } from '../../browser/actions/request-managed-profile-stop.mjs';
import { readGoLoginConfig } from '../../runtime/actions/read-gologin-config.mjs';
import { deleteAppGoLoginProfiles } from '../../gologin-profile/delete-app-gologin-profiles.mjs';

/**
 * Tắt app: chặn mở/bù phiên mới, dừng Orbita và xóa profile của mọi phiên GoLogin, rồi quét xóa profile app còn sót
 * (kể cả phiên đang mở dở chưa vào danh sách).
 * @return {Promise<{stopped: number, deleted: number, failed: number}>} Số phiên đã dừng và profile đã xóa thêm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function shutdownGoLoginSessions() {
  autoRefill.stopRequested = true;
  autoRefill.enabled = false;
  const sessions = [...activeBrowsers].filter(session => session.isGoLogin);
  for (const session of sessions) {
    session.suppressAutoRefill = true;
    session.addBrowserLog?.({ type: 'gologin_close_requested', detail: 'Tắt app: dừng Orbita và xóa profile của phiên.' });
  }
  await Promise.allSettled(sessions.map(session => requestManagedProfileStop(session)));
  const { token } = await readGoLoginConfig().catch(() => ({}));
  const sweep = await deleteAppGoLoginProfiles(token);
  return { stopped: sessions.length, ...sweep };
}
