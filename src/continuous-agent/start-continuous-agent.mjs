import { globalAiConfig } from '../ai-assist/state/global-ai-config.mjs';
import { resolveAiTimeoutSeconds } from '../ai-assist/resolve-ai-timeout-seconds.mjs';
import { createAgySession } from './agy-stream-session.mjs';
import { createApiChatSession } from './api-chat-session.mjs';
import { loadAgentConfig } from './agent-config.mjs';
import { getAgent, registerAgent } from './agent-registry.mjs';
import { runDashboardFormAgent } from './run-dashboard-form-agent.mjs';
import { runContinuousAgent } from './run-continuous-agent.mjs';
import { stopContinuousAgent } from './stop-continuous-agent.mjs';

/**
 * Khởi chạy tối đa một agent trên tab theo chế độ Vận hành hoặc chế độ liên tục đã cấu hình.
 *
 * @param {object} page Tab offer.
 * @param {()=>object} getRecord Hàm lấy record hiện hành của tab (đọc lại mỗi lượt, không chụp một lần).
 * @param {object} session Phiên sở hữu tab.
 * @param {object} [options={}] Origin website đích, cấu hình transport và callback của phiên.
 * @return {object|null} Agent đang chạy hoặc null nếu không bật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function startContinuousAgent(page, getRecord, session, options = {}) {
  const cfg = { ...globalAiConfig, ...(options.aiConfig || {}) };
  if (!cfg.enabled || !['continuous', 'form_agent'].includes(cfg.mode)) return null;
  if (['manual', 'skip', 'consent_only'].includes(session.offerMode)) return null;
  const existing = getAgent(page);
  if (existing) return existing;
  const log = entry => { try { options.onLog ? options.onLog(entry, page) : session.addLog?.(entry); } catch {} };
  const agentConfig = options.agentConfig || loadAgentConfig();
  const timeoutMs = resolveAiTimeoutSeconds(cfg.timeoutSeconds) * 1000;
  const useApi = !options.createTransport && agentConfig.transport === 'api';
  const unsupportedCli = !useApi && String(cfg.cliBinary || 'agy').includes('codex');
  let transport;
  if (unsupportedCli) {
    if (cfg.mode !== 'form_agent') return null;
    log({ time: new Date().toISOString(), type: 'continuous_config_invalid', detail: 'Cần chọn agy hoặc cấu hình API để nhận diện nhãn.' });
  } else if (options.createTransport) transport = options.createTransport({ bin: cfg.cliBinary || 'agy', timeoutMs });
  else if (useApi) {
    try { transport = createApiChatSession({ format: agentConfig.apiFormat, baseUrl: agentConfig.apiBaseUrl, apiKey: agentConfig.apiKey, model: agentConfig.apiModel, timeoutMs }); }
    catch (error) {
      log({ time: new Date().toISOString(), type: 'continuous_config_invalid', detail: `[Continuous AI] Cấu hình API chưa hợp lệ: ${error.message}` });
      if (cfg.mode !== 'form_agent') return null;
    }
  } else {
    transport = createAgySession({ bin: cfg.cliBinary || 'agy', timeoutMs });
  }
  const abortController = new AbortController();
  const agent = { page, session, cfg, allowedOrigin: options.allowedOrigin, transport, abortController, signal: abortController.signal, log, getRecord, status: 'initializing', detail: '', startedAt: Date.now(), lastProgressAt: null, actionCount: 0, turnCount: 0, lastLog: '' };
  registerAgent(page, agent);
  page._continuousAgent = agent;
  agent.onClose = () => stopContinuousAgent(page, 'page_closed');
  page.once?.('close', agent.onClose);
  // Nhiều đường đóng phiên lẻ (refill, lead, tab cuối...) chỉ đặt session.isClosed; watchdog đảm bảo lượt AI đang bay bị hủy.
  agent.watchdog = setInterval(() => { if (session.isClosed || page.isClosed()) stopContinuousAgent(page, session.isClosed ? 'session_closed' : 'page_closed'); }, 1000);
  agent.watchdog.unref?.();
  agent.done = (cfg.mode === 'form_agent' ? runDashboardFormAgent(agent) : runContinuousAgent(agent))
    .catch(error => log({ time: new Date().toISOString(), type: 'continuous_crashed', detail: `[Continuous AI] Agent dừng do lỗi: ${error.message}` }))
    .finally(() => { if (getAgent(page) === agent) stopContinuousAgent(page, 'finished'); });
  return agent;
}
