import { randomUUID } from 'node:crypto';
import { selectActiveForm } from './select-active-form.mjs';
const activeScopes = new WeakMap();

/**
 * Xác định lại form đang làm việc ở từng frame, không dùng chung trạng thái giữa các iframe.
 * @param {object} frame Page hoặc Frame Playwright cần quét.
 * @return {Promise<object|null>} Phạm vi đã xác minh trong DOM hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function resolveActiveFormScope(frame) {
  if (typeof frame.evaluate !== 'function') return null;
  const previous = activeScopes.get(frame);
  let timer;
  const inspection = await Promise.race([
    frame.evaluate(selectActiveForm, { previousId: previous?.id, flowId: previous?.flowId, nextId: randomUUID() }).then(result => ({ verified: true, result })).catch(() => ({ verified: false })),
    new Promise(resolve => { timer = setTimeout(() => resolve({ verified: false }), 3000); timer.unref?.(); }),
  ]).finally(() => clearTimeout(timer));
  const result = inspection.verified ? inspection.result : previous ? { ...previous, active: false, unavailable: true } : null;
  const scope = result?.rootSelector && result?.memberSelector ? result : null;
  activeScopes.set(frame, scope);
  frame._activeAutofillFormScope = scope;
  return scope;
}
