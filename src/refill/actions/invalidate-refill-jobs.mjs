import { autoRefill } from '../../runtime/constants/auto-refill.mjs';

/**
 * Thu hồi quyền bù của lượt cũ khi Stop hoặc bắt đầu lượt chạy mới.
 * @return {void} Job cũ không được tiếp tục điều phối hoặc nhả khóa của job mới.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function invalidateRefillJobs() {
  autoRefill.launchGeneration = (autoRefill.launchGeneration || 0) + 1;
  autoRefill.refillJob = null;
  autoRefill.queued = false;
  autoRefill.isRefilling = false;
  autoRefill.pendingRefillRequest = false;
}
