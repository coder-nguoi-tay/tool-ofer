import { replaceGlobalAiConfig } from './state/global-ai-config.mjs';
import { globalAiConfig } from './state/global-ai-config.mjs';

/**
 * Set global ai config.
 * @param {object} cfg cfg.
 * @return {void} Kết quả xử lý set global ai config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function setGlobalAiConfig(cfg = {}) {
  replaceGlobalAiConfig({
    ...globalAiConfig,
    ...cfg
  });
}
export { setGlobalAiConfig };
