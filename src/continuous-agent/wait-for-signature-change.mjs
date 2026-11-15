import { readVisiblePageState } from '../ai-assist/visible-state/read-visible-page-state.mjs';

/**
 * Ngủ có thể hủy bằng AbortSignal.
 * @param {number} ms Thời gian ngủ.
 * @param {AbortSignal} [signal] Tín hiệu hủy.
 * @return {Promise<void>} Resolve khi hết giờ hoặc bị hủy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function sleep(ms, signal) {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * Chờ giao diện đổi so với chữ ký đã biết mà không gọi model và không giữ chỗ AI.
 * @param {object} page Tab cần theo dõi.
 * @param {object} session Phiên sở hữu tab.
 * @param {string} signature Chữ ký giao diện hiện tại.
 * @param {{signal?:AbortSignal,pollMs?:number,maxMs?:number}} [options={}] Nhịp poll và hạn chờ (mặc định chờ vô hạn).
 * @return {Promise<'changed'|'timeout'|'closed'|'aborted'>} Lý do dừng chờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function waitForSignatureChange(page, session, signature, { signal, pollMs = 1000, maxMs = Infinity } = {}) {
  const deadline = Date.now() + maxMs;
  for (;;) {
    if (signal?.aborted) return 'aborted';
    if (page.isClosed() || session.isClosed) return 'closed';
    if (Date.now() >= deadline) return 'timeout';
    await sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())), signal);
    if (signal?.aborted) return 'aborted';
    if (page.isClosed() || session.isClosed) return 'closed';
    const state = await readVisiblePageState(page);
    if (state.available && state.signature !== signature) return 'changed';
  }
}
