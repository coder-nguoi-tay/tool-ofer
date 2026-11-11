import { parseProxyLine } from '../configuration.mjs';
import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';

/**
 * Import proxy lines.
 * @param {string} rawLines raw lines.
 * @param {object} proxyType proxy type.
 * @return {*} Kết quả xử lý import proxy lines.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function importProxyLines(rawLines, proxyType) {
  const existingAll = new Set([...proxyQueue.available, ...proxyQueue.used]);
  let added = 0;
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try {
      parseProxyLine(trimmed, 1, proxyType);
    } catch {
      continue;
    } // validate
    if (!existingAll.has(trimmed)) {
      proxyQueue.available.push(trimmed);
      existingAll.add(trimmed);
      added++;
    }
  }
  return added;
}
