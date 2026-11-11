/**
 * Các từ khóa nhận diện lựa chọn "Không có mục nào ở trên"
 */
const NONE_OF_THE_ABOVE_PATTERNS = [/^none\b/i, /^none of the above\b/i, /^none of these\b/i, /^không có($|\s)/i, /^không có mục nào($|\s)/i, /^not applicable\b/i, /^n\/a\b/i, /^neither\b/i, /^other\b/i];
export { NONE_OF_THE_ABOVE_PATTERNS };
