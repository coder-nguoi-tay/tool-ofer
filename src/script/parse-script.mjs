/**
 * Phân tích file script thành mảng bước [{cmd, arg}].
 * @param {string} text text.
 * @return {*} Kết quả xử lý parse script.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function parseScript(text) {
  const steps = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const match = line.match(/^\{([^}]+)\}(?:=(.*))?$/);
    if (!match) continue;
    steps.push({
      cmd: match[1],
      arg: match[2] ?? ''
    });
  }
  return steps;
}
export { parseScript };
