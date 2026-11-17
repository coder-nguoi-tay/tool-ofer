import { launchRequestedBrowsers } from './launch-requested-browsers.mjs';
import { openObscuraSession } from '../../obscura-engine/open-obscura-session.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { activeBrowsers } from '../sessions.mjs';
import { maxAliveBrowsers } from '../../runtime/constants/max-alive-browsers.mjs';
import { saveAutoRefillSettings } from '../../refill/actions/save-auto-refill-settings.mjs';
import { applyRunMode } from '../../runtime/constants/run-mode-state.mjs';

/**
 * Mở Obscura qua bộ cấp proxy, offer, lịch sử và giới hạn dùng chung với Chrome.
 * @param {string} requestBody Cấu hình Start JSON, không chứa dữ liệu runtime của engine khác.
 * @param {boolean} isAutomaticRefill True khi chỉ bù slot theo mục tiêu đang có.
 * @param {number[]|null} assignedStreamRoles Offer được bộ tự bù phân công.
 * @return {Promise<object>} Kết quả mở từng proxy cùng cảnh báo của bộ cấp phát chung.
 * @throws {Error} Khi cấu hình, binary hoặc tài nguyên không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export async function launchObscuraBrowsers(requestBody, isAutomaticRefill = false, assignedStreamRoles = null) {
  const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
  if (!isAutomaticRefill) {
    applyRunMode(body.runMode);
    autoRefill.launchGeneration = (autoRefill.launchGeneration || 0) + 1;
    autoRefill.stopRequested = false;
    autoRefill.enabled = true;
    autoRefill.settings = { ...body, browserMode: 'Obscura', useObscura: true, useGoLogin: false };
    const requestedCount = Number(body.requestedCount || body.concurrency) || 1;
    autoRefill.targetCount = Math.min(maxAliveBrowsers, Math.max(autoRefill.targetCount, activeBrowsers.size + requestedCount));
    await saveAutoRefillSettings();
  }
  if (autoRefill.stopRequested || (isAutomaticRefill && autoRefill.noSlotRefill)) return { results: [], warnings: [] };
  return launchRequestedBrowsers(JSON.stringify(body), {
    browserEngine: 'obscura', openBrowser: openObscuraSession, assignedStreamRoles, isAutomaticRefill,
  });
}
