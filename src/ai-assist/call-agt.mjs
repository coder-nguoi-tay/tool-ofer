import { executeAgtProcess } from './execute-agt-process.mjs';
import { globalAiConfig } from './state/global-ai-config.mjs';

/**
 * Gọi `codex` hoặc `agy` CLI với prompt, trả về text output kèm cơ chế Smart Fallback tự động.
 *
 * @param {string} prompt Nội dung truyền vào stdin của codex/agy.
 * @param {object} [options={}] Tùy chọn CLI, timeout và fallback.
 * @return {Promise<string>} Output từ AI CLI.
 * @throws {Error} Khi CLI timeout hoặc kết thúc với mã lỗi và fallback cũng thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function callAgt(prompt, options = {}) {
  const primaryBin = options.cliBinary || globalAiConfig.cliBinary || 'agy';
  try {
    return await executeAgtProcess(prompt, {
      ...options,
      cliBinary: primaryBin
    });
  } catch (err) {
    if (options.allowFallback === false) {
      throw err;
    }
    const fallbackBin = primaryBin.includes('codex') ? 'agy' : 'codex';
    try {
      console.warn(`[AI-Assist] CLI chính (${primaryBin}) lỗi (${err.message}). Đang tự động thử chuyển sang ${fallbackBin}...`);
      const fallbackResult = await executeAgtProcess(prompt, {
        ...options,
        cliBinary: fallbackBin
      });
      console.log(`[AI-Assist] ✅ Tự động fallback sang ${fallbackBin} thành công!`);
      return fallbackResult;
    } catch {
      throw err;
    }
  }
}
export { callAgt };
