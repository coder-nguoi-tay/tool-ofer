import { INTERACTIVE_ROLES } from './state/interactive-roles.mjs';

/**
 * Tính điểm một option từ đặc điểm cấu trúc của nó.
 *
 * @param {object} f Đặc điểm option (visible, enabled, hidden, sameBlock, nearQuestion, role, hasLabel, noise, selected, duplicate).
 * @return {number} Điểm của option.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function scoreOption(f = {}) {
  let score = 0;
  if (f.visible) score += 30;
  if (f.sameBlock) score += 25;
  if (f.nearQuestion) score += 20;
  if (INTERACTIVE_ROLES.has(f.role)) score += 15;
  if (f.hasLabel) score += 10;
  score += f.noise ? -50 : 10;
  if (f.hidden || f.enabled === false) score -= 100;
  if (f.selected) score -= 40;
  if (f.duplicate) score -= 20;
  return score;
}
export { scoreOption };
