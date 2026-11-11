/**
 * Mẫu nhận diện loại câu hỏi §17.3, dạng chuỗi để truyền được vào `frame.evaluate`.
 * Có `\\b` để `page`/`manage`/`care`/`business` không bị nhận nhầm. Thứ tự có ý nghĩa (age → preference → vehicle).
 *
 * @type {Array<[string, string]>}
 */
const QUESTION_TYPE_PATTERNS = [['age_range', '\\b(?:age|how old|years? old|age range|under 18|18-24|25-34|35-44|45-54|55-64|65\\+)'], ['preference', '\\b(?:favou?rite|prefer(?:red|ence)?|like most|what do you like)\\b'], ['vehicle', '\\b(?:vehicles?|cars?|trucks?|suvs?|motorcycles?|vans?|bus|drives?|driving|transport(?:ation)?)\\b']];
export { QUESTION_TYPE_PATTERNS };
