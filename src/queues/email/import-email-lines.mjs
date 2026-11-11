import { emailQueue } from './state/email-queue.mjs';
import { parseEmailLine } from './parse-email-line.mjs';

/**
 * Thêm các dòng email mới vào available, bỏ qua email đã có trong available hoặc used.
 * @param {string[]} rawLines Các dòng email thô.
 * @return {number} Số email mới được thêm vào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function importEmailLines(rawLines) {
  const existingAll = new Set([...emailQueue.available, ...emailQueue.used]);
  let added = 0;
  for (const line of rawLines) {
    const email = parseEmailLine(line);
    if (email && !existingAll.has(email)) {
      emailQueue.available.push(email);
      existingAll.add(email);
      added++;
    }
  }
  return added;
}
export { importEmailLines };
