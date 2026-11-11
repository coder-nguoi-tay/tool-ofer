import { DEFAULT_LEAD_CONFIG } from '../../../lead-check.mjs';
import { autoRefillProxyIfNeeded } from '../../proxy/actions/auto-refill-proxy-if-needed.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { getNextDeviceProfile } from '../../browser/actions/get-next-device-profile.mjs';
import { pendingAgentTasks } from '../../runtime/constants/pending-agent-tasks.mjs';
import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { randomUUID } from 'node:crypto';
import { saveAutofillQueue } from '../../records/actions/save-autofill-queue.mjs';
import { saveProxyQueue } from '../../proxy/actions/save-proxy-queue.mjs';

/**
 * Dispatch one task to agent.
 * @param {*} agent agent.
 * @param {object} settings settings.
 * @return {*} Kết quả xử lý dispatch one task to agent.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function dispatchOneTaskToAgent(agent, settings) {
  if (proxyQueue.available.length === 0) return false;
  const proxyLine = proxyQueue.available.shift();
  proxyQueue.used.push(proxyLine);
  void saveProxyQueue();
  if (proxyQueue.available.length === 0) void autoRefillProxyIfNeeded();
  const record = autofillQueue.available.shift() ?? {};
  if (record && Object.keys(record).length > 0) {
    autofillQueue.used.push(record);
    void saveAutofillQueue();
  }
  const chosenProfile = getNextDeviceProfile();
  pendingAgentTasks.push({
    taskId: randomUUID(),
    proxy: proxyLine,
    proxyType: settings.proxyType ?? 'socks5',
    record,
    websiteUrl: settings.websiteUrl,
    autoSubmitForm: settings.autoSubmitForm ?? true,
    deviceProfile: chosenProfile,
    leadConfig: {
      enabled: settings.enableLeadCheck === true,
      checkScreen: Number(settings.leadCheckScreen) || DEFAULT_LEAD_CONFIG.checkScreen || 4,
      apiUrl: settings.leadCheckApiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
      cookie: settings.leadCheckCookie || DEFAULT_LEAD_CONFIG.cookie,
      datas: settings.leadCheckDatas || DEFAULT_LEAD_CONFIG.datas,
      intervalSeconds: Number(settings.leadCheckInterval) || DEFAULT_LEAD_CONFIG.intervalSeconds,
      maxAttempts: Number(settings.leadCheckMaxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts
    },
    createdAt: Date.now()
  });
  agent.freeSlots = Math.max(0, agent.freeSlots - 1);
  agent.activeTasks++;
  return true;
}
