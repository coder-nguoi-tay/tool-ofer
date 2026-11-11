import { moduleState } from './state/module-state.mjs';
import { MAX_CONCURRENT_AGT } from './state/max-concurrent-agt.mjs';
import { readVisiblePageState } from './visible-state/read-visible-page-state.mjs';
import { protectConfirmedLeadSession } from '../leads/actions/protect-confirmed-lead-session.mjs';

/**
 * Xếp hàng AI dùng chung: IP confirmed được chọn trước, cùng mức ưu tiên giữ thứ tự vào hàng.
 * Caller chỉ nhả agtRunningCount trong finally nếu đã nhận acquired; không hủy AI đang chạy.
 * @param {object} page Tab cần AI hỗ trợ.
 * @param {object} session Phiên sở hữu IP exit đã xác minh.
 * @param {string} signature Trạng thái DOM dự định xử lý.
 * @param {number} maxWaitMs Hạn chờ để trả quyền về autofill.
 * @param {Function|null} onQueued Thông báo khi vị trí/ưu tiên đổi, tránh ghi log mỗi nhịp poll.
 * @return {Promise<string>} acquired, page_changed, queue_timeout hoặc closed.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function waitForAiCapacity(page, session, signature, maxWaitMs = 15000, onQueued = null) {
  const ticket = { page, session, deadline: Date.now() + maxWaitMs };
  moduleState.agtWaiters.push(ticket);
  let nextInspectionAt = 0, lastPosition = '', waited = false;
  /**
   * Đánh giá lại lead khi chọn lượt để phiên vừa nhận lead được nâng ưu tiên ngay.
   * @return {object[]} Các yêu cầu còn hiệu lực, lead trước và FIFO trong từng nhóm.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const ordered = () => moduleState.agtWaiters.filter(item => !item.page.isClosed() && !item.session.isClosed && Date.now() < item.deadline)
    .sort((first, second) => Number(protectConfirmedLeadSession(second.session)) - Number(protectConfirmedLeadSession(first.session)));
  try {
    while (!page.isClosed() && !session.isClosed) {
      if (page._leadRecoveryInProgress) return 'page_changed';
      if (Date.now() >= ticket.deadline) return 'queue_timeout';
      const queue = ordered();
      if (moduleState.agtRunningCount < MAX_CONCURRENT_AGT && queue[0] === ticket) {
        if (waited) {
          const current = await readVisiblePageState(page);
          if (current.available && current.signature !== signature) return 'page_changed';
          if (page.isClosed() || session.isClosed) return 'closed';
          if (moduleState.agtRunningCount >= MAX_CONCURRENT_AGT || ordered()[0] !== ticket) continue;
        }
        moduleState.agtRunningCount++;
        return 'acquired';
      }
      waited = true;
      const priority = protectConfirmedLeadSession(session);
      const position = queue.indexOf(ticket) + 1;
      const key = `${position}:${priority}:${moduleState.agtRunningCount}`;
      if (key !== lastPosition) onQueued?.({ position, priority, running: moduleState.agtRunningCount, limit: MAX_CONCURRENT_AGT });
      lastPosition = key;
      if (Date.now() >= nextInspectionAt) {
        const current = await readVisiblePageState(page);
        if (current.available && current.signature !== signature) return 'page_changed';
        nextInspectionAt = Date.now() + 1000;
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(250, Math.max(1, ticket.deadline - Date.now()))));
    }
    return 'closed';
  } finally {
    const index = moduleState.agtWaiters.indexOf(ticket);
    if (index !== -1) moduleState.agtWaiters.splice(index, 1);
  }
}
