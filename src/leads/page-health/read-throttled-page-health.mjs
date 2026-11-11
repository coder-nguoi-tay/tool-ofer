import { getDeadOrBlockedReason } from './get-dead-or-blocked-reason.mjs';
import { isToffersDuplicateOfferUrl } from '../actions/is-toffers-duplicate-offer-url.mjs';

const pageHealthChecks = new WeakMap();

/**
 * Quét lỗi DOM tối đa một lần mỗi ba giây trên cùng tài liệu; lỗi URL vẫn được bắt ngay.
 * Dùng chung promise khi kiểm tra đang chạy, không phát thêm lệnh evaluate cho cùng tab.
 * @param {object} page Tab cần kiểm tra.
 * @param {number} [now=Date.now()] Mốc kiểm tra phục vụ cache và test.
 * @return {Promise<string|null>} Lý do lỗi hoặc null nếu chưa có lỗi được xác nhận.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function readThrottledPageHealth(page, now = Date.now()) {
  if (!page || page.isClosed?.()) return null;
  const url = page.url();
  if (/^(chrome-error:\/\/|about:neterror)/.test(url)) return 'Lỗi mạng trình duyệt (chrome-error)';
  if (isToffersDuplicateOfferUrl(url)) return 'IP đã click offer trước đó (Toffers Duplicate IP)';
  const revision = page._uxHealthRevision ?? 0;
  const previous = pageHealthChecks.get(page);
  if (previous?.pending) {
    await previous.pending;
    if (previous.url !== url || previous.revision !== revision) return readThrottledPageHealth(page);
    return previous.reason;
  }
  if (previous?.url === url && previous.revision === revision && now - previous.checkedAt < 3000) return previous.reason;
  const state = { url, revision, checkedAt: now, reason: null, pending: null };
  pageHealthChecks.set(page, state);
  state.pending = getDeadOrBlockedReason(page).then(reason => {
    state.reason = page.url() === url && (page._uxHealthRevision ?? 0) === revision ? reason : null;
    return state.reason;
  }).finally(() => { state.pending = null; });
  return state.pending;
}
