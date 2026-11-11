import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Ghi JSONL debug bất đồng bộ theo lô, chỉ có một lượt ghi và tối đa 256 KB chờ trong RAM.
 * @param {string} filePath File do app sinh tên, không nhận đường dẫn từ trang web.
 * @param {Function} onError Callback lỗi ghi hoặc mất sự kiện do hết bộ đệm.
 * @return {object} append, flush và stop; flush/stop chờ ghi hết phần đã nhận.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function createBatchedActionWriter(filePath, onError) {
  let lines = [];
  let bufferedBytes = 0;
  let writtenBytes = null;
  let pending = null;
  let timer = null;
  let stopped = false;
  let dropped = 0;
  /**
   * Ghi lô đang chờ, xoay file debug khi vượt 5 MB; không tạo hàng đợi I/O nối dài.
   * @return {Promise<void>} Hoàn tất các lô đã nhận hoặc báo lỗi qua callback.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  async function flush() {
    clearTimeout(timer); timer = null;
    if (pending) { await pending; if (lines.length) await flush(); return; }
    if (!lines.length) return;
    const content = lines.join('');
    lines = []; bufferedBytes = 0;
    pending = (async () => {
      try {
        await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
        if (writtenBytes === null) writtenBytes = (await stat(filePath).catch(() => null))?.size || 0;
        if (writtenBytes + Buffer.byteLength(content) > 5 * 1024 * 1024) {
          await rename(filePath, filePath.replace(/\.jsonl$/, `-${randomUUID()}.jsonl`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
          writtenBytes = 0;
        }
        await appendFile(filePath, content, { encoding: 'utf8', mode: 0o600 });
        writtenBytes += Buffer.byteLength(content);
      } catch (error) { onError(error.message); }
    })();
    await pending;
    pending = null;
    if (dropped) { const count = dropped; dropped = 0; onError(`Bộ đệm debug quá tải; đã bỏ ${count} sự kiện thô.`); }
    if (lines.length) await flush();
  }
  /**
   * Nhận một sự kiện debug và hẹn ghi sau một giây, bỏ phần cũ nhất khi vượt trần RAM.
   * @param {object} action Hành động đã được chuẩn hóa và che giá trị nhập.
   * @return {void} Lên lịch ghi, không chặn luồng điều khiển browser.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function append(action) {
    if (stopped) return;
    const line = JSON.stringify(action) + '\n';
    lines.push(line); bufferedBytes += Buffer.byteLength(line);
    while (bufferedBytes > 256 * 1024 && lines.length) { bufferedBytes -= Buffer.byteLength(lines.shift()); dropped++; }
    if (!timer && !pending) { timer = setTimeout(() => void flush(), 1000); timer.unref?.(); }
  }
  /**
   * Ngừng nhận sự kiện và ghi nốt lô đang chờ khi phiên kết thúc.
   * @return {Promise<void>} Hoàn tất ghi lô cuối.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  async function stop() { stopped = true; await flush(); }
  return { append, flush, stop };
}
