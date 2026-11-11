/**
 * Gắn cơ chế tự động inject script chống fingerprint cho Web Worker / SharedWorker / ServiceWorker.
 *
 * Tiêu chí an toàn tuyệt đối:
 * 1. Opt-in: Chỉ bật khi antiFingerprint.workerInjection hoặc options.enabled = true.
 * 2. An toàn, không gây treo: waitForDebuggerOnStart = false (Worker không bao giờ bị dừng chờ lệnh).
 * 3. Chống rò rỉ: Tự gỡ bỏ listener khi page / context đóng, có timeout guard.
 *
 * @param {object} context BrowserContext của Playwright.
 * @param {object} page Page Playwright đại diện cho tab.
 * @param {object} stealthConfig Cấu hình stealth (từ buildStealthConfig).
 * @param {object} options Các tuỳ chọn bảo vệ { timeoutMs: 3000, enabled: false, onLog: Function }.
 * @return {Promise<object|null>} Đối tượng quản lý session hoặc null nếu không bật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function attachGuardedWorkerInjection(context, page, stealthConfig, options = {}) {
  const isEnabled = Boolean(options.enabled || stealthConfig?.workerInjection);
  if (!isEnabled || !context || !page) return null;
  const timeoutMs = options.timeoutMs || 4000;
  let cdpSession = null;
  try {
    cdpSession = await Promise.race([context.newCDPSession(page), new Promise((_, reject) => setTimeout(() => reject(new Error('CDP session timeout')), timeoutMs))]);
  } catch (err) {
    options.onLog?.({
      type: 'worker_injection_skip',
      detail: `Không mở được CDP Session cho worker: ${err.message}`
    });
    return null;
  }
  const workerPatchCode = `
    (() => {
      try {
        const proto = (typeof WorkerGlobalScope !== 'undefined' && self.navigator)
          ? Object.getPrototypeOf(self.navigator) || self.navigator
          : null;
        if (!proto) return;
        const replace = (key, val) => {
          try {
            Object.defineProperty(proto, key, {
              get: () => val,
              configurable: true,
              enumerable: true
            });
          } catch {}
        };
        ${stealthConfig?.platform ? `replace('platform', ${JSON.stringify(stealthConfig.platform)});` : ''}
        ${stealthConfig?.hardwareConcurrency ? `replace('hardwareConcurrency', ${Number(stealthConfig.hardwareConcurrency)});` : ''}
        ${stealthConfig?.deviceMemory ? `replace('deviceMemory', ${Number(stealthConfig.deviceMemory)});` : ''}
      } catch {}
    })();
  `;
  const onAttached = async ({
    sessionId,
    targetInfo
  }) => {
    const type = targetInfo?.type;
    const isWorker = type === 'worker' || type === 'service_worker' || type === 'shared_worker';
    if (!isWorker || !sessionId) return;
    try {
      await Promise.race([cdpSession.send('Runtime.evaluate', {
        expression: workerPatchCode,
        returnByValue: true
      }, sessionId), new Promise((_, reject) => setTimeout(() => reject(new Error('Worker inject timeout')), 2000))]).catch(() => {});
      options.onLog?.({
        type: 'worker_injected',
        detail: `Đã bảo vệ fingerprint cho ${type} (${targetInfo.url || 'inline/blob'})`
      });
    } catch {}
  };
  cdpSession.on('Target.attachedToTarget', onAttached);
  try {
    await cdpSession.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [{
        type: 'worker',
        exclude: false
      }, {
        type: 'service_worker',
        exclude: false
      }, {
        type: 'shared_worker',
        exclude: false
      }]
    }).catch(() => {});
  } catch {}
  const cleanup = () => {
    try {
      cdpSession.off('Target.attachedToTarget', onAttached);
      cdpSession.detach().catch(() => {});
    } catch {}
  };
  page.once?.('close', cleanup);
  return {
    cdpSession,
    cleanup
  };
}
export { attachGuardedWorkerInjection };
