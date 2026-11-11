import { randomUUID, createHash } from 'node:crypto';
import { inspectVisibleInteractions } from './inspect-visible-interactions.mjs';
import { hasActionableWork } from './has-actionable-work.mjs';
import { renderVisibleInteractions } from './render-visible-interactions.mjs';

/**
 * Đọc các tương tác đang hiển thị, giới hạn chờ của từng frame và tạo chữ ký tiến triển ổn định.
 * @param {object} page Tab Playwright cần phân tích.
 * @return {Promise<object>} Trạng thái available, frames, hasWork, signature và html cho AI.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function readVisiblePageState(page) {
  const targets = page._activeAutofillFrame ? [page._activeAutofillFrame] : typeof page.frames === 'function' ? page.frames() : [page];
  const states = await Promise.all(targets.slice(0, 8).map(async frame => {
    let timer;
    try {
      return await Promise.race([
        frame.evaluate(inspectVisibleInteractions, { formScope: frame._activeAutofillFormScope || null, markerPrefix: randomUUID() }).catch(() => null),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 2000); timer.unref?.(); }),
      ]);
    } catch { return null; }
    finally { clearTimeout(timer); }
  }));
  const frames = states.filter(state => state && Array.isArray(state.controls) && Array.isArray(state.questions) && Array.isArray(state.errors));
  const stable = frames.map(frame => ({ ...frame, controls: frame.controls.map(({ selector, ...control }) => control) }));
  const state = { available: frames.length > 0, frames };
  return { ...state, hasWork: hasActionableWork(state), signature: createHash('sha256').update(JSON.stringify(stable)).digest('hex'), html: renderVisibleInteractions(frames) };
}
