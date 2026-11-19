import { stopAllContinuousAgents } from '../continuous-agent/stop-continuous-agent.mjs';
import { replaceGlobalAiConfig } from './state/global-ai-config.mjs';
import { globalAiConfig } from './state/global-ai-config.mjs';

/**
 * Set global ai config.
 * @param {object} cfg cfg.
 * @return {void} Kết quả xử lý set global ai config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
function setGlobalAiConfig(cfg = {}) {
  const previousMode = globalAiConfig.mode;
  replaceGlobalAiConfig({
    ...globalAiConfig,
    ...cfg
  });
  if (!globalAiConfig.enabled || globalAiConfig.mode !== previousMode) stopAllContinuousAgents('mode_changed');
}
export { setGlobalAiConfig };
