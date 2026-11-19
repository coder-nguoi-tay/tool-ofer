import { globalAiConfig } from './state/global-ai-config.mjs';
import { homedir, tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

/**
 * Đường dẫn hoặc tên binary của codex / agy CLI.
 * Tự động mở rộng PATH để nhận diện ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.
 * @param {string|null} customBin Tên hoặc đường dẫn CLI đã cấu hình.
 * @return {object} Binary, môi trường và thư mục làm việc riêng dùng cho lượt AI.
 * @throws {Error} Khi không thể tạo thư mục làm việc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
function getAgtSpawnConfig(customBin = null) {
  let codexBin = customBin || globalAiConfig.cliBinary || process.env.CODEX_BIN || 'agy';
  if (codexBin === 'codex_mcp') codexBin = 'codex';
  if (codexBin === 'codex' && process.platform === 'win32') {
    const bundledCodex = fileURLToPath(new URL('../../node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe', import.meta.url));
    if (existsSync(bundledCodex)) codexBin = bundledCodex;
  }
  const augmentedPath = [join(homedir(), '.local', 'bin'), join(homedir(), '.gemini', 'antigravity-cli', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].filter(Boolean).join(delimiter);
  const cwd = join(tmpdir(), 'autolead-agy-cwd');
  mkdirSync(cwd, { recursive: true, mode: 0o700 });
  return {
    cwd,
    bin: codexBin,
    env: {
      ...process.env,
      PATH: augmentedPath
    }
  };
}
export { getAgtSpawnConfig };
