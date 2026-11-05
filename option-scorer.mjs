/**
 * Chấm điểm option của câu hỏi survey theo nghiên cứu §13.5 / §16.4.3
 * (lịch sử git của PLAYWRIGHT_CORE_INTEGRATION_RESEARCH.md).
 *
 * Phần trích đặc điểm chạy trong trang (`frame.evaluate`), phần chấm điểm chạy ở Node
 * để test được mà không cần trình duyệt. Mọi handler câu hỏi dùng chung module này.
 *
 * @module option-scorer
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */

/** Ngưỡng chọn: >= CLICK click ngay, >= FALLBACK click kèm fallback, thấp hơn thì bỏ qua. */
export const OPTION_SCORE_THRESHOLDS = { CLICK: 70, FALLBACK: 40 };

const INTERACTIVE_ROLES = new Set(['radio', 'checkbox', 'button', 'option', 'tab', 'menuitemradio']);

/**
 * Tính điểm một option từ đặc điểm cấu trúc của nó.
 *
 * @param {object} f Đặc điểm option (visible, enabled, hidden, sameBlock, nearQuestion, role, hasLabel, noise, selected, duplicate).
 * @return {number} Điểm của option.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export function scoreOption(f = {}) {
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

/**
 * Gắn điểm và mức xử lý cho từng candidate, giữ nguyên thứ tự DOM.
 *
 * @param {Array<{features: object}>} candidates Danh sách candidate có `features`.
 * @return {Array<object>} Candidate kèm `score` và `tier` ('click' | 'fallback' | 'skip').
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export function rankOptions(candidates = []) {
  return candidates.map((c) => {
    const score = scoreOption(c.features);
    const tier = score >= OPTION_SCORE_THRESHOLDS.CLICK ? 'click' : (score >= OPTION_SCORE_THRESHOLDS.FALLBACK ? 'fallback' : 'skip');
    return { ...c, score, tier };
  });
}

/**
 * Tạo bản ghi quyết định chuẩn §16.3 để log mỗi câu hỏi.
 *
 * @param {object} p Thông tin quyết định.
 * @return {object} Bản ghi JSON theo đúng tên trường của tài liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export function buildOptionDecision({ questionText = '', ranked = [], selected = null, verified = false, fallbackUsed = false, reason = '' } = {}) {
  return {
    questionDetected: Boolean(questionText),
    questionText,
    candidateCount: ranked.length,
    bestCandidateScore: ranked.length ? Math.max(...ranked.map((r) => r.score)) : null,
    selectedCandidateText: selected ? selected.label : null,
    selectionVerified: Boolean(verified),
    fallbackUsed: Boolean(fallbackUsed),
    ambiguous: !selected,
    reason,
  };
}

/**
 * Trích đặc điểm cho các option trong cùng block. Dùng với
 * `frame.locator('[data-ux-option-uid]').evaluateAll(extractOptionFeaturesInPage, nearQuestion)`,
 * nên chỉ được dùng biến cục bộ và DOM API.
 *
 * @param {Element[]} els Các phần tử option đã gắn `data-ux-option-uid`.
 * @param {boolean} nearQuestion Câu hỏi nằm ngay trong block hay không.
 * @return {Array<{uid: string, label: string, features: object}>} Candidate theo thứ tự của `els`.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export function extractOptionFeaturesInPage(els, nearQuestion) {
  const NOISE_RE = /privacy|terms|policy|disclaimer|cookie|unsubscribe|sign in|log ?in|my account|contact us|about us/i;
  const text = (el) => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const labels = els.map(text);
  return els.map((el, i) => {
    const input = el.matches('input') ? el : el.querySelector('input[type="radio"], input[type="checkbox"]');
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const role = el.getAttribute('role') || (input ? input.type : (el.tagName === 'BUTTON' ? 'button' : (el.tagName === 'A' ? 'link' : '')));
    const features = {
      visible: r.width > 4 && r.height > 4 && s.display !== 'none' && s.visibility !== 'hidden',
      enabled: !el.disabled && !(input && input.disabled) && el.getAttribute('aria-disabled') !== 'true',
      hidden: Boolean(el.closest('[aria-hidden="true"], [inert]')),
      sameBlock: true,
      nearQuestion,
      role,
      hasLabel: Boolean(labels[i] || el.getAttribute('aria-label')),
      noise: NOISE_RE.test(labels[i]) || Boolean(el.closest('header, nav, footer, .site-footer, #footer')),
      selected: Boolean((input && input.checked) || el.matches('.selected, .active, [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"]')),
      duplicate: labels.indexOf(labels[i]) !== i,
    };
    return { uid: el.getAttribute('data-ux-option-uid'), label: labels[i].slice(0, 90), features };
  });
}
