/**
 * Kiểm tra kết quả DOM có bằng chứng form/câu hỏi/CTA offer để giữ tab hay không.
 * Tương thích kết quả cũ chỉ có hasForm/hasChoices trong fixture và phiên đang chạy.
 *
 * @param {object|null} content Kết quả detectOfferContentInPage.
 * @return {boolean} True khi còn công việc offer hợp lệ trong vùng nội dung chính.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function hasOfferWorkEvidence(content) {
  if (!content) return false;
  return Boolean(content.hasOfferWork || content.hasForm || content.hasChoices || content.hasFormProgress || content.hasOfferEntry);
}
