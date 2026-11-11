/**
 * Parse JSON actions từ output của agy, chịu được markdown code block và text thừa xung quanh.
 *
 * @param {string} raw Raw output từ agy.
 * @return {Array<{action:string,selector?:string,value?:string}>} Mảng actions.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function parseActions(raw) {
  if (!raw || typeof raw !== 'string') return [];

  // 1. Thử trích xuất khối ```json [ ... ] ``` hoặc ```json { ... } ``` nếu có
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\[\{][\s\S]*?[\]\}])\s*```/i);
  const target = codeBlockMatch ? codeBlockMatch[1] : raw;

  // 2. Thử trích xuất mảng JSON [ ... ]
  const arrayMatch = target.match(/\[\s*\{[\s\S]*\}\s*\]|\[\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(act => act && typeof act === 'object' && typeof act.action === 'string');
      }
    } catch {}
  }

  // 3. Fallback: Nếu trả về single object { "action": "..." }
  const objectMatch = target.match(/\{\s*"action"\s*:\s*"[\s\S]*?\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (parsed && typeof parsed.action === 'string') {
        return [parsed];
      }
    } catch {}
  }
  return [];
}
export { parseActions };
