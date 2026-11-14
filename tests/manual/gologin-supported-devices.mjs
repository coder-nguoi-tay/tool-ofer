import { writeFile } from 'node:fs/promises';
import { GOLOGIN_DEVICE_CHOICES } from '../../src/gologin-profile/device-choices.mjs';
import { buildGoLoginProfileRequest } from '../../src/gologin-profile/build-gologin-profile-request.mjs';
import { createGoLoginProfile } from '../../src/gologin-profile/create-gologin-profile.mjs';
import { startGoLoginProfile } from '../../src/gologin-profile/start-gologin-profile.mjs';
import { stopGoLoginProfile } from '../../src/gologin-profile/stop-gologin-profile.mjs';
import { readGoLoginConfig } from '../../src/runtime/actions/read-gologin-config.mjs';
import { connectGoLoginProfile } from '../../src/browser/gologin/connect-profile.mjs';
import { configureGoLoginDevice } from '../../src/browser/gologin/configure-device.mjs';
import { recordGoLoginDeviceFingerprint } from '../../src/browser/gologin/record-device-fingerprint.mjs';
import { fillPageForms } from '../../src/autofill/fill-page-forms.mjs';
import { humanClick } from '../../src/autofill/human-click.mjs';
import { installAccessOnlyConsole } from '../../src/logging/install-access-only-console.mjs';

if (!process.argv.includes('--live')) {
  process.stdout.write('Chạy chủ động: AUTOLEADPC_INSTANCE=2 node tests/manual/gologin-supported-devices.mjs --live\n');
  process.exit(0);
}
installAccessOnlyConsole();
const { token } = await readGoLoginConfig();
if (!token) throw new Error('Chưa cấu hình token GoLogin cho instance được chọn.');
const report = [];
const reportPath = '/tmp/autolead-gologin-supported-live.json';
const html = 'data:text/html,' + encodeURIComponent('<meta name="viewport" content="width=device-width,initial-scale=1"><form id="qa"><label>First name<input name="first_name" required></label><label>Email<input name="email" type="email" required></label><button type="submit">Continue</button></form><div id="result"></div><script>document.querySelector("form").onsubmit=e=>{e.preventDefault();document.querySelector("#result").textContent="completed"}</script>');
const requestedDevice = process.argv.find(argument => argument.startsWith('--device='))?.slice(9);
const requestedVersion = process.argv.find(argument => argument.startsWith('--version='))?.slice(10) || '150';
const headless = process.argv.includes('--headless');
for (const choice of GOLOGIN_DEVICE_CHOICES.filter(item => !requestedDevice || item.key === requestedDevice)) {
  let profileId, connected;
  let stopped = true;
  const result = { device: choice.label, requestedVersion, apiCreated: false, orbitaStarted: false, ipDetected: false, autofill: false, submit: false, deleted: false };
  process.stdout.write(JSON.stringify({ device: choice.label, requestedVersion, phase: 'starting' }) + '\n');
  try {
    const payload = buildGoLoginProfileRequest({ deviceProfile: choice.key, browserVersion: requestedVersion });
    payload.name = `AutoLeadPC QA ${Date.now()} ${choice.label}`;
    payload.notes = 'Temporary isolated device smoke test; delete after test.';
    payload.startUrl = 'about:blank';
    profileId = await createGoLoginProfile(token, payload);
    result.apiCreated = true;
    const profileResponse = await fetch(`https://api.gologin.com/browser/${profileId}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000)
    });
    const storedProfile = await profileResponse.json();
    result.osVerified = storedProfile.os === payload.os;
    result.osSpecVerified = (storedProfile.osSpec || '') === payload.osSpec;
    stopped = false;
    connected = await connectGoLoginProfile(() => startGoLoginProfile(token, profileId,
      headless ? { extra_params: ['--headless=new'] } : {}), stopGoLoginProfile);
    result.orbitaStarted = true;
    const { context, browser } = connected;
    result.orbitaVersion = browser.version();
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(15000);
    const session = { browser: context, _cdpBrowser: browser, mainPage: page, slot: 1, deviceProfile: choice.key,
      deviceVersion: choice.label, userAgent: payload.navigator.userAgent, enableLeadCheck: false, isGoLogin: true, logs: [] };
    session.addBrowserLog = entry => session.logs.push(entry);
    await configureGoLoginDevice(session);
    process.stdout.write(JSON.stringify({ device: choice.label, phase: 'device-configured' }) + '\n');
    try {
      const response = await page.goto('https://api.ipify.org?format=json', { waitUntil: 'domcontentloaded', timeout: 10000 });
      session.exitIp = JSON.parse(await page.locator('body').innerText()).ip;
      result.ipDetected = response?.ok() && Boolean(session.exitIp);
    } catch {}
    await page.goto(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await recordGoLoginDeviceFingerprint(session, connected.gl);
    const deviceLog = session.logs.find(entry => entry.type === 'gologin_device_detected');
    result.deviceLogRecorded = Boolean(deviceLog?.ip && deviceLog?.platform && deviceLog?.userAgent && deviceLog?.orbitaVersion);
    result.loggedProfileOs = deviceLog?.profileOs || null;
    result.loggedPlatform = deviceLog?.platform || null;
    process.stdout.write(JSON.stringify({ device: choice.label, phase: 'read-navigator' }) + '\n');
    const actual = await page.evaluate(async () => ({ platform: navigator.platform, ua: navigator.userAgent,
      touch: navigator.maxTouchPoints, width: innerWidth,
      hints: navigator.userAgentData ? await Promise.race([navigator.userAgentData.getHighEntropyValues(['platformVersion', 'architecture']), new Promise(resolve => setTimeout(() => resolve(null), 2000))]) : null }));
    result.platform = actual.platform;
    result.reportedUserAgent = actual.ua;
    result.matchesProfilePlatform = actual.platform === payload.navigator.platform;
    result.matchesProfileUa = actual.ua === payload.navigator.userAgent;
    result.touch = actual.touch;
    result.width = actual.width;
    result.platformVersion = actual.hints?.platformVersion || null;
    const record = { firstname: 'Device', email: 'device-qa@example.invalid' };
    page._assignedRecord = record;
    process.stdout.write(JSON.stringify({ device: choice.label, phase: 'autofill' }) + '\n');
    await fillPageForms(page, { session, sessionRecord: record, options: { autoSubmit: false, enableLeadCheck: false, onLog: entry => process.stdout.write(JSON.stringify({ device: choice.label, event: entry.type }) + '\n') }, triggerLeadCheckAfterEmail: () => {} });
    process.stdout.write(JSON.stringify({ device: choice.label, phase: 'verify-form' }) + '\n');
    result.autofill = await page.locator('[name="first_name"]').inputValue() === 'Device'
      && await page.locator('[name="email"]').inputValue() === record.email;
    await humanClick(page, page.locator('[type="submit"]'));
    result.submit = await page.locator('#result').textContent() === 'completed';
  } catch (error) {
    if (error.goLoginStopUnconfirmed !== true && !connected) stopped = true;
    result.error = String(error.message).split(token).join('[TOKEN]').replace(/https?:\/\/\S+/g, '[URL]').slice(0, 250);
  } finally {
    if (connected) {
      try { await stopGoLoginProfile(connected.gl); stopped = true; }
      catch { result.stopError = true; }
      await connected.browser.close().catch(() => {});
    }
    if (profileId && stopped) {
      try {
        const response = await fetch(`https://api.gologin.com/browser/${profileId}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000)
        });
        result.deleted = response.ok;
      } catch {}
    }
    result.stopped = stopped;
    report.push(result);
    await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
    process.stdout.write(JSON.stringify(result) + '\n');
  }
}
process.stdout.write(JSON.stringify({ reportPath, passed: report.filter(item => item.autofill && item.submit && item.deviceLogRecorded && item.matchesProfilePlatform && item.matchesProfileUa && item.osVerified && item.osSpecVerified && item.deleted).length, total: report.length }) + '\n');
process.exit(report.every(item => item.autofill && item.submit && item.deviceLogRecorded && item.matchesProfilePlatform && item.matchesProfileUa && item.osVerified && item.osSpecVerified && item.deleted) ? 0 : 1);
