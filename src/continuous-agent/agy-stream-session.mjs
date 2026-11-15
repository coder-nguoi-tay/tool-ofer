import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAgtSpawnConfig } from '../ai-assist/get-agt-spawn-config.mjs';

/**
 * Thư mục làm việc riêng, rỗng cho agy: agent không có file dự án nào trong tầm tay.
 * Thư mục chỉ được tạo, không bao giờ bị xóa bởi app.
 */
const AGY_CWD = join(tmpdir(), 'autolead-agy-cwd');

/**
 * Process `agy` sống lâu cho một tab: mỗi lượt gửi một dòng NDJSON `{"event":"user","message":{"content":...}}`
 * và nhận đúng một event `result`. Hội thoại được giữ trong process nên các lượt sau không gửi lại ngữ cảnh cũ.
 * Process chết/timeout thì `turns` về 0 và lượt kế tiếp tự spawn lại (caller gửi lại prompt đầu).
 *
 * @param {object} [options={}] bin, timeoutMs, spawnFn (tiêm cho test), args bổ sung.
 * @return {{send:Function,close:Function,kill:Function,readonly turns:number,readonly conversationId:string|null}} Phiên transport.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function createAgySession({ bin = 'agy', timeoutMs = 100_000, spawnFn = spawn, args = [] } = {}) {
  let child = null, buffer = '', pending = null, turns = 0, conversationId = null, stderrTail = '';

  /**
   * Hoàn tất lượt đang chờ đúng một lần.
   * @param {Error|null} error Lỗi nếu có.
   * @param {object} [value] Kết quả nếu thành công.
   * @return {void}
   */
  const settle = (error, value) => {
    const current = pending;
    if (!current) return;
    pending = null;
    clearTimeout(current.timer);
    error ? current.reject(error) : current.resolve(value);
  };

  /**
   * Xử lý một dòng event từ agy.
   * @param {string} line Một dòng JSON.
   * @return {void}
   */
  const handleLine = line => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.event === 'init') conversationId = event.init?.conversation_id || conversationId;
    if (event.event !== 'result') return;
    const result = event.result || {};
    conversationId = result.conversation_id || conversationId;
    if (result.status === 'SUCCESS') { turns += 1; settle(null, { text: String(result.response ?? ''), usage: result.usage || {}, conversationId }); return; }
    settle(new Error(`agy: ${result.error || result.status || 'lỗi không rõ'}`));
  };

  /**
   * Spawn process agy nếu chưa có hoặc đã chết.
   * @return {object} Child process đang chạy.
   */
  const ensureChild = () => {
    if (child) return child;
    mkdirSync(AGY_CWD, { recursive: true });
    const { bin: resolvedBin, env } = getAgtSpawnConfig(bin);
    const proc = spawnFn(resolvedBin, ['--input-format', 'stream-json', '--output-format', 'stream-json', '--effort', 'low', '--mode', 'plan', '--sandbox', '--disable-slash-commands', ...args], { cwd: AGY_CWD, env, stdio: ['pipe', 'pipe', 'pipe'] });
    child = proc; buffer = ''; turns = 0; conversationId = null;
    proc.stdout.on('data', chunk => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1); if (line) handleLine(line); }
    });
    proc.stderr.on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-300); });
    proc.stdin.on('error', () => {});
    proc.on('error', error => {
      if (child === proc) child = null;
      settle(new Error(error.code === 'ENOENT' ? `${resolvedBin} không có trong PATH` : error.message));
    });
    proc.on('close', code => {
      if (child === proc) { child = null; turns = 0; }
      settle(new Error(`agy thoát (${code}) giữa lượt: ${stderrTail.trim() || 'không có stderr'}`));
    });
    return proc;
  };

  /**
   * Gửi một lượt và chờ kết quả; chỉ cho phép một lượt tại một thời điểm.
   * @param {string} text Nội dung lượt.
   * @return {Promise<{text:string,usage:object,conversationId:string}>} Phản hồi của agy.
   */
  const send = text => new Promise((resolve, reject) => {
    if (pending) { reject(new Error('turn_in_flight')); return; }
    let proc;
    try { proc = ensureChild(); } catch (error) { reject(error); return; }
    const timer = setTimeout(() => { settle(new Error(`agy timeout (quá ${timeoutMs / 1000}s)`)); kill(); }, timeoutMs);
    timer.unref?.();
    pending = { resolve, reject, timer };
    proc.stdin.write(`${JSON.stringify({ event: 'user', message: { content: text } })}\n`);
  });

  /**
   * Giết process ngay (đồng bộ) và hủy lượt đang chờ.
   * @return {void}
   */
  const kill = () => {
    const proc = child;
    child = null; turns = 0;
    try { proc?.kill('SIGKILL'); } catch {}
    settle(new Error('agy_closed'));
  };

  /**
   * Đóng nhẹ nhàng: đóng stdin để agy tự thoát, SIGKILL nếu 2 giây sau vẫn còn.
   * @return {void}
   */
  const close = () => {
    const proc = child;
    if (!proc) { settle(new Error('agy_closed')); return; }
    try { proc.stdin.end(); } catch {}
    const guard = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 2000);
    guard.unref?.();
    proc.once('close', () => clearTimeout(guard));
    child = null; turns = 0;
    settle(new Error('agy_closed'));
  };

  return { send, close, kill, get turns() { return turns; }, get conversationId() { return conversationId; } };
}
