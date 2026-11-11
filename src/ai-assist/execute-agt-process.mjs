import { CODEX_MODEL } from './state/codex-model.mjs';
import { CODEX_REASONING_EFFORT } from './state/codex-reasoning-effort.mjs';
import { getAgtSpawnConfig } from './get-agt-spawn-config.mjs';
import { globalAiConfig } from './state/global-ai-config.mjs';
import { resolveAiTimeoutSeconds } from './resolve-ai-timeout-seconds.mjs';
import { spawn } from 'node:child_process';

/**
 * Thực thi một tiến trình AI CLI đơn lẻ (`agy` hoặc `codex`).
 *
 * @param {string} prompt Nội dung truyền vào stdin.
 * @param {object} [options={}] Tùy chọn CLI và timeout.
 * @return {Promise<string>} Output từ AI CLI.
 * @throws {Error} Khi CLI timeout, ném lỗi hoặc kết thúc với mã lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function executeAgtProcess(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = resolveAiTimeoutSeconds(options.timeoutSeconds || globalAiConfig.timeoutSeconds) * 1000;
    const {
      bin,
      env
    } = getAgtSpawnConfig(options.cliBinary);
    const isCodex = bin.includes('codex');
    const isAgy = bin.includes('agy') || !isCodex;
    // agy: Tắt chế độ suy nghĩ (--effort low), bỏ hỏi quyền (--dangerously-skip-permissions), tắt slash commands để ưu tiên tốc độ tối đa
    const args = isAgy ? ['--effort', 'low', '--dangerously-skip-permissions', '--disable-slash-commands'] : isCodex ? ['exec', '--model', CODEX_MODEL, '--config', `model_reasoning_effort="${CODEX_REASONING_EFFORT}"`, '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--ephemeral', '--json', '-'] : [];
    const child = spawn(bin, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${bin} timeout (quá ${timeoutMs / 1000}s)`));
    }, timeoutMs);
    child.stdout.on('data', d => {
      out += d.toString();
    });
    child.stderr.on('data', d => {
      err += d.toString();
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        reject(new Error(`${bin} exited ${code}: ${err.slice(0, 200)}`));
        return;
      }
      if (isCodex) {
        // Parse JSONL
        const lines = out.split('\n').filter(Boolean);
        const events = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean);

        // Kiểm tra lỗi trong luồng sự kiện Codex (ví dụ usage limit hoặc failure)
        const errorEv = events.find(ev => ev.type === 'error' || ev.type === 'turn.failed');
        if (errorEv) {
          const errMsg = errorEv.message || errorEv.error?.message || 'Lỗi không xác định từ Codex CLI';
          reject(new Error(`Codex CLI: ${errMsg}`));
          return;
        }

        // gom tất cả item.completed[agent_message].text
        const text = events.filter(ev => ev?.type === 'item.completed' && ev?.item?.type === 'agent_message').map(ev => ev.item.text).join('\n');
        if (!text && out.includes('error')) {
          reject(new Error(`Codex CLI trả về phản hồi không hợp lệ: ${out.slice(0, 200)}`));
          return;
        }
        resolve(text || out);
      } else {
        resolve(out);
      }
    });
    child.on('error', e => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') {
        reject(new Error(`${bin} CLI không có trong PATH. Bỏ qua tầng AI.`));
      } else {
        reject(e);
      }
    });
    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}
export { executeAgtProcess };
