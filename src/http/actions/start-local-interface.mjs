import { createInterfaceRequestHandler } from '../create-interface-request-handler.mjs';
import { activeBrowsers } from '../../browser/sessions.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { autoRefillSettingsPath } from '../../runtime/constants/auto-refill-settings-path.mjs';
import { checkRequestedProxies } from '../../proxy/actions/check-requested-proxies.mjs';
import { cleanupStaleProfiles } from '../../browser/chrome-profiles.mjs';
import { clearUsedProxyHistory } from '../../proxy/actions/clear-used-proxy-history.mjs';
import { closeActiveBrowsers } from '../../browser/actions/close-active-browsers.mjs';
import { createServer } from 'node:http';
import { downloadRealChromeVersions } from '../../browser/actions/download-real-chrome-versions.mjs';
import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { existsSync } from 'node:fs';
import { exitWhenParentExits } from '../../process/actions/exit-when-parent-exits.mjs';
import { initializeEmailQueue } from '../../queues/email.mjs';
import { instanceId } from '../../config/paths.mjs';
import { launchRequestedBrowsers } from '../../browser/actions/launch-requested-browsers.mjs';
import { launchUserRequestedBrowsers } from '../../browser/actions/launch-user-requested-browsers.mjs';
import { listUsedExitIps } from '../../proxy/actions/list-used-exit-ips.mjs';
import { loadAiConfig } from '../../config/ai.mjs';
import { loadAutofillQueue } from '../../records/actions/load-autofill-queue.mjs';
import { loadAutofillRejected } from '../../records/actions/load-autofill-rejected.mjs';
import { loadAutofillUsed } from '../../records/actions/load-autofill-used.mjs';
import { loadBandwidthStats } from '../../monitoring/bandwidth.mjs';
import { loadDualStreamState } from '../../runtime/actions/load-dual-stream-state.mjs';
import { loadEmailAutoRefillConfig } from '../../queues/email.mjs';
import { loadLeadStats } from "../../leads/statistics/load-lead-stats.mjs";
import { loadOfferStrategies } from '../../leads/actions/load-offer-strategies.mjs';
import { loadPersistedBrowserLogs } from '../../logging/browser-logs.mjs';
import { loadProxy711AutoRefillConfig } from '../../proxy/actions/load-proxy711-auto-refill-config.mjs';
import { loadProxy711Config } from '../../proxy/provider711.mjs';
import { loadProxyQueue } from '../../proxy/actions/load-proxy-queue.mjs';
import { loadSavedDeviceProfiles } from '../../browser/actions/load-saved-device-profiles.mjs';
import { loadToffersConfig } from '../../leads/toffers-overview.mjs';
import { openTemplateProfile } from '../../browser/actions/open-template-profile.mjs';
import { port } from '../../runtime/constants/port.mjs';
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { readFileSync } from 'node:fs';
import { registerBotCommands } from '../../../tgbot.mjs';
import { releaseStalePortHolder } from '../../process/actions/release-stale-port-holder.mjs';
import { runExclusively } from '../../runtime/constants/run-exclusively.mjs';
import { start711BalanceBackgroundPolling } from '../../proxy/provider711.mjs';
import { startTelegramBot } from '../../../tgbot.mjs';
import { startToffersBackgroundPolling } from '../../leads/toffers-overview.mjs';
import { startTunnel } from '../../../tunnel.mjs';
import { updateAutoRefill } from '../../refill/actions/update-auto-refill.mjs';
import { userInterfacePath } from '../../runtime/constants/user-interface-path.mjs';
import { userInterfacePcPath } from '../../runtime/constants/user-interface-pc-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Khởi động giao diện cục bộ và mở nó trong trình duyệt mặc định của macOS.
 *
 * @return {Promise<void>} Hoàn tất khi giao diện được mở.
 * @throws {Error} Khi máy chủ giao diện không thể lắng nghe cổng cục bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function startLocalInterface() {
  void cleanupStaleProfiles();
  // Dọn profile mồ côi định kỳ mỗi 5 phút (bắt Chrome crash không trigger close event)
  setInterval(() => void cleanupStaleProfiles(), 5 * 60 * 1000);

  // Watchdog kiểm tra tự bù liên tục mỗi 4 giây: đảm bảo khi mọi browser đã đóng vẫn tự bù lại slot mới
  setInterval(() => {
    if (autoRefill.enabled && !autoRefill.stopRequested && autoRefill.settings && !autoRefill.queued) {
      for (const s of [...activeBrowsers]) {
        const isDead = s.isClosed ||
          (s.browser && typeof s.browser.isClosed === 'function' && s.browser.isClosed()) ||
          (s.browser && typeof s.browser.isConnected === 'function' && !s.browser.isConnected()) ||
          (s.isManagedProfile && s._cdpBrowser && !s._cdpBrowser.isConnected());
        if (isDead) {
          s.isClosed = true;
          activeBrowsers.delete(s);
        }
      }
      const aliveCount = [...activeBrowsers].filter(s => !s.isClosed && !s.browser?.isClosed?.()).length;
      const target = autoRefill.sequential ? 1 : autoRefill.targetCount;
      if (aliveCount < target) {
        queueAutomaticRefill(0);
      }
    }
  }, 4000);
  await loadAutofillUsed();
  await loadAutofillRejected();
  await loadAutofillQueue();
  await loadProxyQueue();
  await loadDualStreamState();
  await initializeEmailQueue();
  await loadEmailAutoRefillConfig();
  await loadProxy711Config();
  await loadProxy711AutoRefillConfig();
  await loadOfferStrategies();
  // Khi khởi động app: luôn reset về 0 (idle/stopped), không tự động chạy lại
  autoRefill.enabled = false;
  autoRefill.settings = null;
  autoRefill.targetCount = 0;
  autoRefill.queued = false;
  autoRefill.stopRequested = false;
  autoRefill.message = 'Sẵn sàng. Bấm Start để bắt đầu.';
  void writeFile(autoRefillSettingsPath, '{}', 'utf8').catch(() => {});
  await loadSavedDeviceProfiles();
  await loadPersistedBrowserLogs();
  loadAiConfig();
  await loadToffersConfig();
  await loadLeadStats();
  await loadBandwidthStats();
  startToffersBackgroundPolling(10_000);
  start711BalanceBackgroundPolling(30_000);
  const interfaceHtml = readFileSync(userInterfacePath, 'utf8');
  const interfacePcHtml = existsSync(userInterfacePcPath) ? readFileSync(userInterfacePcPath, 'utf8') : interfaceHtml;
  const handlers = {
    '/launch': runExclusively(launchUserRequestedBrowsers),
    '/launch-adspower': runExclusively(launchRequestedBrowsers),
    '/check': checkRequestedProxies,
    '/close': closeActiveBrowsers,
    '/stop': closeActiveBrowsers,
    '/auto-refill': updateAutoRefill,
    '/used-ips': listUsedExitIps,
    '/used-ips/clear': runExclusively(clearUsedProxyHistory),
    '/chrome-versions/download': runExclusively(downloadRealChromeVersions),
    '/template-profile/open': runExclusively(openTemplateProfile)
  };
  const server = createServer(createInterfaceRequestHandler({
    interfaceHtml,
    interfacePcHtml,
    handlers
  }));

  // Không có listener thì EADDRINUSE nổ thành stack trace khi app đã chạy sẵn.
  const listenHost = process.argv.includes('--public') ? '0.0.0.0' : '127.0.0.1';
  let portTakeoverAttempted = false;
  server.on('error', async error => {
    if (error.code === 'EADDRINUSE') {
      if (!portTakeoverAttempted) {
        portTakeoverAttempted = true;
        // Máy chủ cũ còn sót (app bị tắt cưỡng) vẫn giữ cổng và phục vụ code cũ.
        // Dừng nó rồi tự chiếm lại cổng để bản build mới thực sự chạy.
        const takeover = await releaseStalePortHolder(port);
        if (takeover.released) {
          console.log(`[Server] Đã giải phóng cổng ${port}, khởi động lại máy chủ giao diện.`);
          server.listen(port, listenHost, onServerListening);
          return;
        }
        console.error(`Cổng ${port} đang có tiến trình khác dùng — AutoLeadPC Mac có thể đang mở rồi.`);
      } else {
        console.error(`Cổng ${port} vẫn bị chiếm sau khi đã dừng tiến trình cũ.`);
      }
      // Không phục vụ được thì thoát hẳn: tiến trình sống sót chỉ giữ cổng và làm
      // bản app mới không bao giờ lên được cổng (giao diện nối nhầm vào code cũ).
      process.exit(1);
      return;
    }
    throw error;
  });

  /**
   * Xử lý sự kiện máy chủ đã lắng nghe xong: mở giao diện và bật các tiến trình nền.
   *
   * @return {Promise<void>} Hoàn tất khi giao diện đã được mở (nếu không chạy ẩn).
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  async function onServerListening() {
    const interfaceUrl = `http://127.0.0.1:${port}`;
    console.log(`AutoLeadPC Mac [Bản ${instanceId}] đang chạy tại ${interfaceUrl}`);
    if (listenHost === '0.0.0.0') console.log(`[Hub] Lắng nghe trên tất cả giao diện mạng — agent có thể kết nối qua IP LAN:${port}`);
    startTunnel(port).then(res => {
      if (res?.ok && res.url) {
        console.log(`[Hub] Tunnel đã sẵn sàng (${res.url}), đồng bộ menu bot Telegram...`);
        registerBotCommands().catch(() => {});
      }
    }).catch(() => {});
    void startTelegramBot();
    // Giữ bằng chứng để xem lại phiên lỗi; người dùng chủ động xóa trong tab Nhật ký.
    if (process.env.AUTOLEADPC_NO_OPEN === '1') return;
    try {
      await executeFile('open', [interfaceUrl]);
    } catch {
      console.log(`Mở URL này trong trình duyệt: ${interfaceUrl}`);
    }
  }

  // Cài watchdog TRƯỚC khi lắng nghe: nếu lắng nghe hỏng thì tiến trình cũng phải
  // tự thoát khi cha chết, không được sống sót giữ cổng.
  exitWhenParentExits();
  // Dọn trình duyệt mồ côi từ phiên trước: app vừa khởi động là KHÔNG có session nào
  // trong bộ nhớ, còn lại Chrome/SunBrowser chạy ngầm từ lần trước sẽ biến thành
  // "web đang chạy nhưng tab Running không thấy gì". Kill sạch trước khi nhận luồng mới.
  for (const profileRoot of ['AutoLeadPC-2', 'AutoLeadPC-3', 'AutoLeadPC', 'AutoLeadPC-AdsPower-Smoke', 'AutoLeadPC-Debug', 'AutoLeadPC Wine']) {
    await executeFile('pkill', ['-9', '-f', `user-data-dir.*Application Support/${profileRoot}`]).catch(() => {});
  }
  server.listen(port, listenHost, onServerListening);
}
