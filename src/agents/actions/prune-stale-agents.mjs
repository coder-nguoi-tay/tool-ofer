import { remoteAgents } from '../../runtime/constants/remote-agents.mjs';

/**
 * Thêm các dòng proxy mới từ textarea vào available, bỏ qua dòng đã có trong available hoặc used.
 * @param {string[]} rawLines Các dòng proxy thô.
 * @param {string} proxyType Scheme mặc định.
 * @return {number} Số dòng mới được thêm vào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function pruneStaleAgents() {
  const cutoff = Date.now() - 60_000;
  for (const [id, a] of remoteAgents) {
    if (a.lastSeen < cutoff) remoteAgents.delete(id);
  }
}
