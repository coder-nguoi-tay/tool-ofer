const byPage = new WeakMap();
const live = new Set();
let exitHookInstalled = false;

/**
 * Đăng ký agent của một tab; mỗi tab đúng một agent. Gọi đồng bộ, trước mọi await.
 * @param {object} page Tab sở hữu agent.
 * @param {object} agent Trạng thái agent.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function registerAgent(page, agent) {
  byPage.set(page, agent);
  live.add(agent);
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  // Process app thoát đột ngột không được để agy mồ côi.
  process.once('exit', () => { for (const item of live) item.transport?.kill?.(); });
}

/**
 * Gỡ agent khỏi registry.
 * @param {object} page Tab sở hữu agent.
 * @param {object} agent Agent cần gỡ.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function unregisterAgent(page, agent) {
  if (byPage.get(page) === agent) byPage.delete(page);
  live.delete(agent);
}

/**
 * Lấy agent của tab.
 * @param {object} page Tab cần tra.
 * @return {object|undefined} Agent hoặc undefined.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export const getAgent = page => byPage.get(page);

/**
 * Liệt kê mọi agent đang sống (dùng cho Stop tất cả).
 * @return {object[]} Danh sách agent.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export const listAgents = () => [...live];
