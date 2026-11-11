import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { getDeadOrBlockedReason } from '../../src/leads/page-health/get-dead-or-blocked-reason.mjs';
import { readThrottledPageHealth } from '../../src/leads/page-health/read-throttled-page-health.mjs';
import { captureScreenThumbnail } from '../../src/browser/screen/capture-screen-thumbnail.mjs';

const browserCount = Math.max(1, Math.min(20, Number(process.argv[2]) || 10));
const durationSeconds = Math.max(10, Number(process.argv[3]) || 10);
const browsers = [];
const tabs = [];
const sessions = [];
const diagnostics = [];
const connections = [];

/**
 * Đo tổng CPU tích lũy và RSS của các tiến trình thuộc những Chromium benchmark riêng biệt.
 * @return {Promise<object>} CPU giây và tổng RSS MB (có thể tính trùng bộ nhớ chia sẻ).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function measureBrowserProcesses() {
  const processes = (await Promise.all(connections.map(connection => connection.send('SystemInfo.getProcessInfo')))).flatMap(result => result.processInfo);
  const residentKb = execFileSync('ps', ['-o', 'rss=', '-p', processes.map(process => process.id).join(',')], { encoding: 'utf8' });
  return {
    cpuSeconds: processes.reduce((sum, process) => sum + process.cpuTime, 0),
    residentMb: Math.round(residentKb.trim().split(/\s+/).reduce((sum, value) => sum + Number(value), 0) / 1024),
  };
}

try {
  for (let index = 0; index < browserCount; index++) {
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    connections.push(await browser.newBrowserCDPSession());
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('**/*', route => route.abort());
    await page.setContent('<title>Offline benchmark</title><style>body{font:24px sans-serif;padding:80px}input{display:block;margin:20px}</style><form><h1>Offline form</h1><input type="email"><input name="firstName"><button>Continue</button></form>');
    tabs.push(page);
    sessions.push({});
    diagnostics.push({ captures: 0, captureFailures: 0, captureDurationTotalMs: 0, captureDurationMaxMs: 0 });
  }
  for (const mode of ['baseline', 'optimized']) {
    const before = await measureBrowserProcesses();
    const loop = monitorEventLoopDelay({ resolution: 20 });
    loop.enable();
    let snapshots = 0;
    const startedAt = performance.now();
    let nextSnapshotAt = 0;
    let ticks = 0;
    while (performance.now() - startedAt < durationSeconds * 1000) {
      await Promise.all(tabs.map(page => mode === 'baseline' ? getDeadOrBlockedReason(page) : readThrottledPageHealth(page)));
      const elapsed = performance.now() - startedAt;
      if (elapsed >= nextSnapshotAt) {
        nextSnapshotAt = elapsed + (mode === 'baseline' ? 2500 : 5000);
        await Promise.all(tabs.map(async (page, index) => {
          if (mode === 'optimized' && index >= 4) return;
          await new Promise(resolve => setTimeout(resolve, index * 80));
          const image = mode === 'baseline'
            ? await page.screenshot({ type: 'jpeg', quality: 35, scale: 'css', timeout: 3000 })
            : await captureScreenThumbnail(sessions[index], page, diagnostics[index]);
          if (image) snapshots++;
        }));
      }
      ticks++;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, ticks * 1000 - (performance.now() - startedAt))));
    }
    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    const after = await measureBrowserProcesses();
    loop.disable();
    console.log(JSON.stringify({ mode, browsers: browserCount, durationSeconds: Math.round(elapsedSeconds), browserCpuPercent: Math.round((after.cpuSeconds - before.cpuSeconds) / elapsedSeconds * 100), residentMb: after.residentMb, loopP95Ms: Math.round(loop.percentile(95) / 1e6), thumbnailResponses: snapshots, thumbnailCaptures: mode === 'baseline' ? snapshots : diagnostics.reduce((sum, state) => sum + state.captures, 0), visibleThumbnails: mode === 'baseline' ? browserCount : Math.min(4, browserCount) }));
  }
} finally {
  await Promise.allSettled(browsers.map(browser => browser.close()));
}
