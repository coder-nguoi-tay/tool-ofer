import { openObscuraSession } from '../../obscura-engine/open-obscura-session.mjs';
import { acquireProxyLock } from '../../proxy/actions/acquire-proxy-lock.mjs';
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { isProxyCurrentlyActive } from '../../proxy/actions/is-proxy-currently-active.mjs';
import { enqueueExclusively } from '../../runtime/actions/enqueue-exclusively.mjs';
import { loadScript } from '../../../script.mjs';
import { activeBrowsers } from '../../browser/sessions.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { createProxyUsageKey } from '../../proxy/actions/create-proxy-usage-key.mjs';
import { getNextDeviceProfile } from '../../browser/actions/get-next-device-profile.mjs';
import { listInstalledChromeChannels } from '../../browser/chrome-installations.mjs';
import { normalizeUrl } from '../../proxy/configuration.mjs';
import { openBrowserWithInstalledChrome } from '../../browser/actions/open-browser-with-installed-chrome.mjs';
import { parseProxyLine } from '../../proxy/configuration.mjs';
import { readScreenSize } from '../../browser/actions/read-screen-size.mjs';
import { tileAt } from '../../browser/actions/tile-at.mjs';

/**
 * Thực thi task bằng engine được hub phân công, giữ khóa proxy tới khi phiên thực sự dừng.
 * @param {object} task Proxy, record và cấu hình offer/runtime do hub giao.
 * @return {Promise<*>} Kết quả xử lý run agent task.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export async function runAgentTask(task) {
  const {
    proxy: proxyLine,
    proxyType = 'socks5',
    record,
    websiteUrl,
    autoSubmitForm,
    leadConfig,
    deviceProfile
  } = task;
  const proxy = parseProxyLine(proxyLine.trim(), 1, proxyType);
  const proxyKey = createProxyUsageKey(proxy, 0);
  if (task.browserMode === 'Obscura') {
    const launchGeneration = autoRefill.launchGeneration;
    return enqueueExclusively(async () => {
      if (launchGeneration !== autoRefill.launchGeneration) throw new Error('Task Obscura đã bị hủy bởi lệnh Stop.');
      if (isProxyCurrentlyActive(proxy)) throw new Error('Proxy của task đang được sử dụng.');
      acquireProxyLock(proxy);
      try {
        let tileIndex = 0;
        const occupied = new Set([...activeBrowsers].map(session => session.tileIndex));
        while (occupied.has(tileIndex)) tileIndex++;
        return await openObscuraSession({
          ...task, proxy, proxyKey, tileIndex, usedExitIps: new Set(), onExitIp: async () => {},
          shouldAbort: () => launchGeneration !== autoRefill.launchGeneration, websiteUrl: normalizeUrl(websiteUrl), autofillRecords: record ? [record] : [],
          autoSubmit: autoSubmitForm !== false, leadConfig: leadConfig || {}, deviceProfile: deviceProfile || getNextDeviceProfile(),
          offerNumber: task.offerNumber || 1, streamRole: task.offerNumber || 1,
          scriptSteps: task.scriptPath ? await loadScript(task.scriptPath) : null,
        });
      } catch (error) {
        if (!error.obscuraStopUnconfirmed) releaseProxyLock(proxy);
        throw error;
      }
    });
  }
  const builds = await listInstalledChromeChannels();
  if (builds.length === 0) throw new Error('Không có Google Chrome trên máy này');
  const build = builds[applicationState.chromeBuildRotationCounter % builds.length];
  applicationState.chromeBuildRotationCounter++;
  const screen = await readScreenSize();
  const tileIndex = activeBrowsers.size;
  const tile = tileAt(tileIndex, 1, screen);
  return openBrowserWithInstalledChrome({
    build,
    proxy,
    proxyKey,
    websiteUrl: normalizeUrl(websiteUrl),
    usedExitIps: new Set(),
    onExitIp: () => {},
    tile,
    tileIndex,
    autofillRecords: record && Object.keys(record).length > 0 ? [record] : [],
    autoSubmit: autoSubmitForm !== false,
    leadConfig: leadConfig ?? {},
    deviceProfile: deviceProfile ?? getNextDeviceProfile()
  });
}
