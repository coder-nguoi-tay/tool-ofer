import { globalAiConfig } from './state/global-ai-config.mjs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

/**
 * Đường dẫn hoặc tên binary của codex / agy CLI.
 * Tự động mở rộng PATH để nhận diện ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.
 * @param {*} customBin custom bin.
 * @return {*} Kết quả xử lý get agt spawn config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function getAgtSpawnConfig(customBin = null) {
  let codexBin = customBin || globalAiConfig.cliBinary || process.env.CODEX_BIN || 'agy';
  if (codexBin === 'codex_mcp') codexBin = 'codex';
  if (codexBin === 'codex' && process.platform === 'win32') {
    const bundledCodex = fileURLToPath(new URL('../../node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe', import.meta.url));
    if (existsSync(bundledCodex)) codexBin = bundledCodex;
  }
  const augmentedPath = [join(homedir(), '.local', 'bin'), join(homedir(), '.gemini', 'antigravity-cli', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].filter(Boolean).join(delimiter);
  return {
    bin: codexBin,
    env: {
      ...process.env,
      PATH: augmentedPath
    }
  };
}
export { getAgtSpawnConfig };
