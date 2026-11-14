import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

if (!process.argv.includes('--live')) {
  process.stdout.write('Chạy chủ động: node tests/manual/gologin-in-app-recovery.mjs --live\n');
  process.exit(0);
}
const token = JSON.parse(readFileSync(join(homedir(), 'Library/Application Support/AutoLeadPC-2/gologin-config.json'), 'utf8')).token;
const directory = mkdtempSync(join(homedir(), 'Library/Application Support/AutoLeadPC-tests-gologin-recovery-'));
process.env.AUTOLEADPC_DATA_DIR = basename(directory);
process.env.AUTOLEADPC_LOG_MODE = 'access';
const { installAccessOnlyConsole } = await import('../../src/logging/install-access-only-console.mjs');
installAccessOnlyConsole();
const { openGoLoginBrowser } = await import('../../src/browser/actions/open-gologin-browser.mjs');
const { buildGoLoginProfileRequest } = await import('../../src/gologin-profile/build-gologin-profile-request.mjs');
const { buildGoLoginLaunchOptions } = await import('../../src/gologin-profile/build-launch-options.mjs');
const { createGoLoginProfile } = await import('../../src/gologin-profile/create-gologin-profile.mjs');
const { startGoLoginProfile } = await import('../../src/gologin-profile/start-gologin-profile.mjs');
const { stopGoLoginProfile } = await import('../../src/gologin-profile/stop-gologin-profile.mjs');
const { checkProxyExitIp } = await import('../../src/proxy/actions/check-proxy-exit-ip.mjs');
const { requestManagedProfileStop } = await import('../../src/browser/actions/request-managed-profile-stop.mjs');
const { humanClick } = await import('../../src/autofill/human-click.mjs');
const { savePersistedBrowserLogs } = await import('../../src/logging/browser-logs.mjs');
const { moduleState } = await import('../../src/logging/browser-logs/state/module-state.mjs');
const { pruneDeadManagedSessions } = await import('../../src/runtime/actions/prune-dead-managed-sessions.mjs');

const sockets = new Set();
const proxyServer = createServer((request, response) => {
  const target = new URL(request.url, `http://${request.headers.host}`);
  const upstream = httpRequest({ hostname: target.hostname === 'autolead-qa.invalid' ? '127.0.0.1' : target.hostname, port: target.port || 80, path: target.pathname + target.search,
    method: request.method, headers: request.headers }, incoming => { response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response); });
  upstream.on('error', () => { response.writeHead(502); response.end(); });
  request.pipe(upstream);
});
proxyServer.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
proxyServer.on('connect', (request, socket, head) => {
  const address = new URL(`http://${request.url}`);
  const upstream = connect(Number(address.port) || 443, address.hostname, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream); upstream.pipe(socket);
  });
  sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
  upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
});
const formServer = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<meta name="viewport" content="width=device-width,initial-scale=1"><form><label>First name<input name="first_name" required></label><label>Email<input type="email" name="email" required></label><button type="submit">Continue</button></form><div id="result"></div><script>document.querySelector("form").onsubmit=e=>{e.preventDefault();document.querySelector("#result").textContent="completed"}</script>');
});
await new Promise(resolve => proxyServer.listen(0, '127.0.0.1', resolve));
await new Promise(resolve => formServer.listen(0, '127.0.0.1', resolve));
const proxy = { server: `http://127.0.0.1:${proxyServer.address().port}` };
const formUrl = `http://autolead-qa.invalid:${formServer.address().port}/`;
const results = [];
/**
 * Chờ điều kiện trong test sống, có giới hạn để SDK lỗi không giữ browser thử vô hạn.
 * @param {Function} check Điều kiện đồng bộ hoặc bất đồng bộ.
 * @param {number} timeout Khoảng chờ tối đa.
 * @return {Promise<void>} Điều kiện đã đúng.
 * @throws {Error} Khi quá thời gian.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function until(check, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 200)); }
  throw new Error('QA condition timeout');
}
try {
  const exitIp = await checkProxyExitIp(proxy);
  if (!exitIp) throw new Error('Không đọc được IP qua proxy QA loopback.');
  for (const device of ['windows', 'android']) {
    let id, session, gl;
    const result = { device, hidden: false, form: false, reconnected: false, sameProcess: false, sameLead: false, screenshot: false, stopped: false, deleted: false };
    process.stdout.write(JSON.stringify({ device, phase: 'starting-headless' }) + '\n');
    try {
      const payload = buildGoLoginProfileRequest({ deviceProfile: device, proxy, exitIp });
      payload.name = `AutoLeadPC QA hidden-recovery ${Date.now()} ${device}`;
      payload.notes = 'Temporary isolated headless/reconnect QA; delete after test.'; payload.startUrl = 'about:blank';
      id = await createGoLoginProfile(token, payload);
      session = await openGoLoginBrowser({ slot: 1, profileId: id, proxy, verifiedExitIp: exitIp,
        websiteUrl: formUrl, offerUrls: [formUrl], screenPreviewOnly: true, deviceProfile: device,
        userAgent: payload.navigator.userAgent, autoSubmit: false, dataSaver: false,
        autofillRecords: [{ firstname: 'Device', email: 'qa-recovery@example.invalid' }], leadConfig: { enabled: false },
        startProfile: async () => { const started = await startGoLoginProfile(token, id, buildGoLoginLaunchOptions({ screenPreviewOnly: true })); gl = started.gl; return started; },
        stopProfile: stopGoLoginProfile });
      const child = gl.processSpawned;
      const swift = 'import CoreGraphics; import Foundation; let pid=Int(CommandLine.arguments[1])!; let rows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as! [[String:Any]]; print(rows.filter{($0[kCGWindowOwnerPID as String] as? Int)==pid && ($0[kCGWindowLayer as String] as? Int)==0}.count)';
      const visible = Number(execFileSync('swift', ['-e', swift, String(child.pid)], { encoding: 'utf8', timeout: 30000 }).trim());
      result.hidden = visible === 0 && child.spawnargs.includes('--headless=new') && session.trueHeadless;
      await until(async () => await session.mainPage.locator('[name="email"]').inputValue({ timeout: 1000 }) === 'qa-recovery@example.invalid');
      await humanClick(session.mainPage, session.mainPage.locator('[type="submit"]'));
      result.form = await session.mainPage.locator('#result').textContent() === 'completed';
      const previous = session._cdpBrowser;
      session.confirmedLeadIp = exitIp; session.leadCheckStatus = 'confirmed';
      const record = session.currentRecord;
      await previous.close();
      await pruneDeadManagedSessions();
      await until(() => session.connectionStatus === 'connected' && session._cdpBrowser !== previous);
      result.reconnected = true; result.sameProcess = session.isGoLoginProcessAlive() && session._gologinProcess.pid === child.pid;
      result.sameLead = session.confirmedLeadIp === exitIp && session.currentRecord === record;
      result.screenshot = (await session.mainPage.screenshot({ type: 'jpeg', timeout: 10000 })).length > 0;
    } catch (error) { result.error = error.name + ': ' + String(error.message).split(token).join('[TOKEN]').replace(/https?:\/\/\S+/g, '[URL]').slice(0, 160); }
    finally {
      if (session) { session.suppressAutoRefill = true; await requestManagedProfileStop(session); result.stopped = !session.isGoLoginProcessAlive(); }
      else if (gl) { await stopGoLoginProfile(gl).catch(() => {}); result.stopped = gl.processSpawned?.exitCode !== null || gl.processSpawned?.signalCode !== null; }
      if (id && (!gl || result.stopped)) result.deleted = (await fetch(`https://api.gologin.com/browser/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) })).ok;
      results.push(result); process.stdout.write(JSON.stringify(result) + '\n');
    }
  }
} catch (error) { process.stdout.write(JSON.stringify({ error: error.name }) + '\n'); }
finally {
  sockets.forEach(socket => socket.destroy()); proxyServer.close(); formServer.close();
  clearTimeout(moduleState.saveBrowserLogsTimer); await savePersistedBrowserLogs();
  writeFileSync('/tmp/autolead-gologin-headless-recovery-result.json', JSON.stringify(results, null, 2), { mode: 0o600 });
  rmSync(directory, { recursive: true, force: true });
}
process.exit(results.length === 2 && results.every(row => row.hidden && row.form && row.reconnected && row.sameProcess && row.sameLead && row.screenshot && row.stopped && row.deleted) ? 0 : 1);
