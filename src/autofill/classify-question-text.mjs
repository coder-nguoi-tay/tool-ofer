import { QUESTION_TYPE_PATTERNS } from './state/question-type-patterns.mjs';

/**
 * Phân loại câu hỏi theo tài liệu nghiên cứu §17 (PLAYWRIGHT_CORE_INTEGRATION_RESEARCH.md):
 * 'age_range' | 'preference' | 'vehicle' | 'unknown'.
 *
 * @param {string} text Văn bản câu hỏi (đã normalize朱 lowercase).
 * @return {'age_range'|'preference'|'vehicle'|'unknown'} Loại câu hỏi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function classifyQuestionText(text) {
  const t = String(text || '').toLowerCase();
  for (const [type, src] of QUESTION_TYPE_PATTERNS) {
    if (new RegExp(src).test(t)) return type;
  }
  return 'unknown';
}
export { classifyQuestionText };
