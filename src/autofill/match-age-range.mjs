/**
 * Kiểm tra xem một nhãn lựa chọn dải tuổi có bao gồm độ tuổi chỉ định hay không.
 * Hỗ trợ các định dạng: "18 - 34", "35-49", "50 - 64", "OVER 65", "65+", "Under 25".
 *
 * @param {string} optionText Nhãn văn bản của lựa chọn.
 * @param {number} age Độ tuổi cần đối sánh.
 * @return {boolean} True nếu khớp dải tuổi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function matchAgeRange(optionText, age) {
  if (typeof age !== 'number' || Number.isNaN(age)) return false;
  const text = String(optionText || '').trim();

  // 1. Khoảng dạng "18 - 34", "35-49", "50 - 64", "18 to 24"
  const rangeMatch = text.match(/(\d+)\s*(?:[-–to]+|\s+to\s+)\s*(\d+)/i);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      return age >= min && age <= max;
    }
  }

  // 2. Dạng "OVER 65", "65+", "> 65", "65 and older", "65 or older"
  const overMatch = text.match(/(?:over|>|hơn|trên|\+)\s*(\d+)|(\d+)\s*(?:\+|and older|or older)/i);
  if (overMatch) {
    const min = parseInt(overMatch[1] || overMatch[2], 10);
    if (!Number.isNaN(min)) {
      return age >= min;
    }
  }

  // 3. Dạng "UNDER 25", "< 25", "dưới 25"
  const underMatch = text.match(/(?:under|<|dưới)\s*(\d+)/i);
  if (underMatch) {
    const max = parseInt(underMatch[1], 10);
    if (!Number.isNaN(max)) {
      return age < max;
    }
  }
  return false;
}
export { matchAgeRange };
