/**
 * Các từ khóa nhận diện nút điều hướng tiến tới (Next / Continue / Submit)
 */
const NEXT_BUTTON_PATTERNS = [/^next\b/i, /^continue\b/i, /^proceed\b/i, /^tiếp tục($|\s)/i, /^tiếp theo($|\s)/i, /^submit\b/i, /^submit survey\b/i, /^finish\b/i, /^hoàn tất($|\s)/i, /^next step\b/i, /^next question\b/i, /^answer\b/i, /^get started\b/i, /^start survey\b/i, /^confirm\b/i, /^xác nhận($|\s)/i];
export { NEXT_BUTTON_PATTERNS };
