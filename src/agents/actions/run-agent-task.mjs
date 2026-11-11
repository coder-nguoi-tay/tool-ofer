import { activeBrowsers } from '../../browser/sessions.mjs';
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
 * Run agent task.
 * @param {*} task task.
 * @return {Promise<*>} Kết quả xử lý run agent task.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
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
