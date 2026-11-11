/**
 * Tạo bản ghi quyết định chuẩn §16.3 để log mỗi câu hỏi.
 *
 * @param {object} p Thông tin quyết định.
 * @return {object} Bản ghi JSON theo đúng tên trường của tài liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildOptionDecision({
  questionText = '',
  ranked = [],
  selected = null,
  verified = false,
  fallbackUsed = false,
  reason = ''
} = {}) {
  return {
    questionDetected: Boolean(questionText),
    questionText,
    candidateCount: ranked.length,
    bestCandidateScore: ranked.length ? Math.max(...ranked.map(r => r.score)) : null,
    selectedCandidateText: selected ? selected.label : null,
    selectionVerified: Boolean(verified),
    fallbackUsed: Boolean(fallbackUsed),
    ambiguous: !selected,
    reason
  };
}
export { buildOptionDecision };
