import { activeBrowsers } from '../sessions.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { lastLaunchSettingsPath } from '../../runtime/constants/last-launch-settings-path.mjs';
import { launchRequestedBrowsers } from './launch-requested-browsers.mjs';
import { maxAliveBrowsers } from '../../runtime/constants/max-alive-browsers.mjs';
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { saveAutoRefillSettings } from '../../refill/actions/save-auto-refill-settings.mjs';
import { selectProxies } from '../../proxy/configuration.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Launch user requested browsers.
 * @param {object} requestBody request body.
 * @return {Promise<*>} Kết quả xử lý launch user requested browsers.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function launchUserRequestedBrowsers(requestBody) {
  autoRefill.stopRequested = false;
  autoRefill.enabled = true;
  const body = JSON.parse(requestBody);
  body.browserMode = 'Chrome';
  delete body.useAdsPower;
  // Lưu cấu hình lần chạy gần nhất riêng (Stop không xoá file này) để /run trên Telegram chạy được ngay,
  // không phải mở app bấm Start lại sau mỗi lần Stop.
  void writeFile(lastLaunchSettingsPath, JSON.stringify({
    settings: body,
    savedAt: new Date().toISOString()
  }), 'utf8').catch(() => {});
  const activeBeforeLaunch = activeBrowsers.size;
  const result = await launchRequestedBrowsers(requestBody);
  const countParam = body.requestedCount !== undefined && body.requestedCount !== '' ? body.requestedCount : body.concurrency;
  const requestedCount = countParam === undefined || countParam === '' ? Math.min(maxAliveBrowsers, selectProxies(body.proxyList, body.proxyType ?? 'socks5', '').length) : Number(countParam);

  // Luôn lưu cấu hình tự bù khi người dùng bấm Start (kể cả lượt đầu đang thử hoặc chưa kịp mở cửa sổ nào)
  autoRefill.settings = {
    proxyList: body.proxyList,
    proxyType: body.proxyType ?? 'socks5',
    websiteUrl: body.websiteUrl,
    websiteUrl2: body.websiteUrl2,
    websiteUrl3: body.websiteUrl3,
    websiteUrl4: body.websiteUrl4,
    offerUrls: body.offerUrls || (body.websiteUrl3 || body.websiteUrl4 ? [body.websiteUrl, body.websiteUrl2, body.websiteUrl3, body.websiteUrl4].filter(Boolean) : undefined),
    checkDuplicate: body.checkDuplicate !== false,
    autofillData: body.autofillData,
    autoSubmitForm: body.autoSubmitForm !== false,
    enableLeadCheck: body.enableLeadCheck === true,
    leadCheckApiUrl: body.leadCheckApiUrl,
    leadCheckCookie: body.leadCheckCookie,
    leadCheckDatas: body.leadCheckDatas,
    leadCheckInterval: body.leadCheckInterval,
    leadCheckMaxAttempts: body.leadCheckMaxAttempts,
    scriptPath: body.scriptPath ?? '',
    captchaApiKey: body.captchaApiKey ?? '',
    completeText: body.completeText ?? '',
    timeLimit: Math.max(0, Number(body.timeLimit) || 0),
    delayStart: Math.max(0, Number(body.delayStart) || 0),
    delayStop: Math.max(0, Number(body.delayStop) || 0),
    limitRun: Math.max(0, Number(body.limitRun) || 0),
    antiFpCanvas: Boolean(body.antiFpCanvas),
    antiFpClientRects: Boolean(body.antiFpClientRects),
    antiFpWebgl: Boolean(body.antiFpWebgl),
    antiFpWebrtc: Boolean(body.antiFpWebrtc),
    Windows: Boolean(body.Windows),
    Mac: Boolean(body.Mac),
    Linux: Boolean(body.Linux),
    Android: Boolean(body.Android),
    iPhone: Boolean(body.iPhone),
    iPad: Boolean(body.iPad),
    hideUntilTarget: Boolean(body.hideUntilTarget ?? body.hideBrowser),
    hideBrowser: Boolean(body.hideUntilTarget ?? body.hideBrowser),
    hideUntilLead: Boolean(body.hideUntilLead),
    runInApp: Boolean(body.screenPreviewOnly ?? body.runInApp ?? true),
    screenPreviewOnly: Boolean(body.screenPreviewOnly ?? body.runInApp ?? true),
    useCloakBrowser: Boolean(body.useCloakBrowser ?? body.cloakBrowser),
    dataSaver: Boolean(body.dataSaver !== false)
  };
  autoRefill.targetCount = Math.min(maxAliveBrowsers, Math.max(autoRefill.targetCount, activeBeforeLaunch + requestedCount, activeBrowsers.size));
  autoRefill.message = `Tự bù ${autoRefill.enabled ? 'đang bật' : 'đang tắt'}: ${activeBrowsers.size}/${autoRefill.targetCount} trình duyệt.`;
  void saveAutoRefillSettings();
  if (autoRefill.enabled && activeBrowsers.size < autoRefill.targetCount) {
    queueAutomaticRefill(2000);
  }
  return {
    ...result,
    autoRefillEnabled: autoRefill.enabled
  };
}
