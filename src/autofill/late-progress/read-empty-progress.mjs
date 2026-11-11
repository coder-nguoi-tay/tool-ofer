import { inspectEmptyProgress } from './inspect-empty-progress.mjs';
import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';

/**
 * Kiểm tra tất cả frame đang thấy để không reload trang cha khi câu hỏi nằm trong iframe.
 * @param {object} page Tab cần theo dõi màn gần cuối.
 * @return {Promise<object|null>} Snapshot đủ tin cậy hoặc null khi frame không đọc được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function readEmptyProgress(page) {
  try {
    const frames = page.frames?.() || [page];
    const states = [];
    for (const frame of frames) {
      if (frame !== page && frame !== page.mainFrame?.() && typeof frame.frameElement === 'function') {
        const element = await frame.frameElement();
        try { if (!await element.isVisible()) continue; }
        finally { await element.dispose(); }
      }
      const state = await readEvidenceWithTimeout(frame, 'late-progress', () => frame.evaluate(inspectEmptyProgress));
      if (!state || state.readyState === 'loading' || typeof state.hasWork !== 'boolean') return null;
      states.push(state);
    }
    return { empty: states.some(state => state.progress >= 80) && !states.some(state => state.hasWork || state.challenge), frames: states };
  } catch { return null; }
}
