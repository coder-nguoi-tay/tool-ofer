import { OPTION_SCORE_THRESHOLDS } from './state/option-score-thresholds.mjs';
import { scoreOption } from './score-option.mjs';

/**
 * Gắn điểm và mức xử lý cho từng candidate, giữ nguyên thứ tự DOM.
 *
 * @param {Array<{features: object}>} candidates Danh sách candidate có `features`.
 * @return {Array<object>} Candidate kèm `score` và `tier` ('click' | 'fallback' | 'skip').
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function rankOptions(candidates = []) {
  return candidates.map(c => {
    const score = scoreOption(c.features);
    const tier = score >= OPTION_SCORE_THRESHOLDS.CLICK ? 'click' : score >= OPTION_SCORE_THRESHOLDS.FALLBACK ? 'fallback' : 'skip';
    return {
      ...c,
      score,
      tier
    };
  });
}
export { rankOptions };
