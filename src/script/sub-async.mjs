import { randomTextFile } from './random-text-file.mjs';

/**
 * Thay thế {Var} và RandomTextFile(...) trong chuỗi.
 * @param {string} text text.
 * @param {*} vars vars.
 * @param {*} scriptDir script dir.
 * @return {Promise<*>} Kết quả xử lý sub async.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function subAsync(text, vars, scriptDir) {
  let result = String(text).replace(/\{([^}]+)\}/g, (_, k) => vars[k] ?? '');
  const rtfRe = /RandomTextFile\(([^)]+)\)/g;
  let m;
  const replacements = [];
  while ((m = rtfRe.exec(result)) !== null) {
    replacements.push({
      match: m[0],
      file: m[1]
    });
  }
  for (const {
    match,
    file
  } of replacements) {
    const val = await randomTextFile(file, scriptDir);
    result = result.replace(match, val);
  }
  return result;
}
export { subAsync };
