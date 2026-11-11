const pendingReads = new WeakMap();

/**
 * Đọc HTML/trạng thái có hạn 3 giây và không phát lặp cùng lệnh đọc vào renderer còn treo.
 * Timeout chỉ dừng chờ; promise đọc cũ vẫn được theo dõi tới khi tự kết thúc.
 * @param {object} target Page hoặc Frame đang đọc.
 * @param {string} part Loại dữ liệu HTML/title/form.
 * @param {Function} read Hàm thực hiện lệnh đọc Playwright.
 * @return {Promise<*>} Dữ liệu đã đọc.
 * @throws {Error} Khi renderer chưa trả lệnh cũ hoặc quá hạn đọc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function readEvidenceWithTimeout(target, part, read) {
  let reads = pendingReads.get(target);
  if (!reads) { reads = new Set(); pendingReads.set(target, reads); }
  if (reads.has(part)) throw new Error(`Đang chờ renderer trả dữ liệu ${part} của lượt chụp trước.`);
  reads.add(part);
  const result = Promise.resolve().then(read).finally(() => reads.delete(part));
  let timer;
  try {
    return await Promise.race([result, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Quá 3 giây khi đọc bằng chứng ${part}.`)), 3000);
      timer.unref?.();
    })]);
  } finally { clearTimeout(timer); }
}
