import { emailQueue } from './state/email-queue.mjs';
import { parseEmailLine } from './parse-email-line.mjs';

/**
 * Đọc batch email từ file nguồn bắt đầu tại byteOffset, trả về emails và offset mới.
 * @param {string} filePath File nguồn email.
 * @param {number} byteOffset Vị trí bắt đầu đọc theo byte.
 * @param {number} batchSize Số email tối đa trong lô.
 * @return {Promise<{emails: string[], newByteOffset: number}>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function readEmailBatchFromSource(filePath, byteOffset, batchSize) {
  const {
    createReadStream
  } = await import('fs');
  const {
    createInterface
  } = await import('readline');
  const existingAll = new Set([...emailQueue.available, ...emailQueue.used]);
  const emails = [];
  let bytesConsumed = 0;
  let done = false;
  await new Promise(resolve => {
    const stream = createReadStream(filePath, {
      start: byteOffset,
      encoding: 'utf8'
    });
    const rl = createInterface({
      input: stream,
      crlfDelay: Infinity
    });
    rl.on('line', line => {
      if (emails.length >= batchSize) {
        done = true;
        rl.close();
        return;
      }
      const raw = line.trim();
      bytesConsumed += Buffer.byteLength(line, 'utf8') + 1;
      const email = parseEmailLine(raw);
      if (email && !existingAll.has(email)) {
        emails.push(email);
        existingAll.add(email);
      }
    });
    rl.on('close', () => resolve());
    stream.on('error', () => resolve());
  });
  return {
    emails,
    newByteOffset: byteOffset + bytesConsumed
  };
}
export { readEmailBatchFromSource };
