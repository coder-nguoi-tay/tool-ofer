import { globalAiConfig } from './state/global-ai-config.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Đường dẫn hoặc tên binary của codex / agy CLI.
 * Tự động mở rộng PATH để nhận diện ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.
 * @param {*} customBin custom bin.
 * @return {*} Kết quả xử lý get agt spawn config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getAgtSpawnConfig(customBin = null) {
  let codexBin = customBin || globalAiConfig.cliBinary || process.env.CODEX_BIN || 'agy';
  if (codexBin === 'codex_mcp') codexBin = 'codex';
  const augmentedPath = [join(homedir(), '.local', 'bin'), join(homedir(), '.gemini', 'antigravity-cli', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].filter(Boolean).join(':');
  return {
    bin: codexBin,
    env: {
      ...process.env,
      PATH: augmentedPath
    }
  };
}
export { getAgtSpawnConfig };
