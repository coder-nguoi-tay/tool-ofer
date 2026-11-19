import { getAgent, listAgents, unregisterAgent } from './agent-registry.mjs';

/**
 * Dừng agent của một tab: chặn thao tác mới, hủy lượt đang chờ, giết agy, nhả cờ owner. Idempotent.
 * Không hoàn tác được click đã gửi; vòng lặp tự thoát khi thấy tín hiệu hủy.
 *
 * @param {object} page Tab có agent.
 * @param {string} [reason='stopped'] Lý do (ghi vào trạng thái).
 * @return {boolean} True nếu có agent được dừng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function stopContinuousAgent(page, reason = 'stopped') {
  const agent = getAgent(page);
  if (!agent || agent.status === 'stopped') return false;
  agent.status = 'stopped'; agent.detail = reason;
  clearInterval(agent.watchdog);
  page.off?.('close', agent.onClose);
  agent.abortController.abort();
  agent.transport.kill();
  agent.session.aiRunningPages?.delete(page);
  if (page._aiAssistRunning && page._continuousAgent === agent) page._aiAssistRunning = false;
  agent.session.aiAssistRunning = (agent.session.aiRunningPages?.size ?? 0) > 0;
  page._continuousAgent = null;
  unregisterAgent(page, agent);
  return true;
}

/**
 * Dừng mọi agent đang chạy (nút Stop/Đóng tất cả).
 * @param {string} [reason='stop_all'] Lý do.
 * @return {number} Số agent đã dừng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function stopAllContinuousAgents(reason = 'stop_all') {
  return listAgents().filter(agent => stopContinuousAgent(agent.page, reason)).length;
}
