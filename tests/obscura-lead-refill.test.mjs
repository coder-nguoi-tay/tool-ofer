import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { activeProxyLocks } from '../src/runtime/constants/active-proxy-locks.mjs';
import { activeExitIpLocks } from '../src/runtime/constants/active-exit-ip-locks.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';
import { getNextDeviceProfile } from '../src/browser/actions/get-next-device-profile.mjs';
import { getObscuraProfileIdentity } from '../src/obscura-engine/profile-identity.mjs';
import { proxyIdentity } from '../src/runtime/actions/proxy-identity.mjs';
import { lastClosedObscuraIdentities } from '../src/obscura-engine/sessions.mjs';

let hasNativeBinary = true;
try { resolveObscuraBinary(); } catch { hasNativeBinary = false; }

/**
 * Nạp source thật, chỉ thay biên API/proxy và launcher fixture để không gọi dịch vụ thật.
 * @param {string} file Đường dẫn source tính từ gốc dự án.
 * @param {object} mocks Các export thay ở biên test.
 * @param {object} context Test context để dọn mock khi xong.
 * @return {Promise<object>} Export của module cô lập dùng chung state runtime thật.
 * @throws {Error} Khi source hoặc module fixture không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function loadFixtureModule(file, mocks, context) {
  const sourceUrl = new URL(`../${file}`, import.meta.url);
  const key = `obscura-lead-${randomUUID()}`;
  globalThis[key] = mocks;
  context.after(() => { delete globalThis[key]; });
  const source = (await readFile(sourceUrl, 'utf8')).replace(/import \{([^}]+)\} from (["'])([^"']+)\2;/g, (statement, names, quote, location) => {
    const bindings = names.split(',').map(name => name.trim().split(/\s+as\s+/));
    if (bindings.every(([exportName]) => exportName in mocks)) {
      return `const {${bindings.map(([exportName, localName]) => `${exportName}: ${localName || exportName}`).join(',')}} = globalThis[${JSON.stringify(key)}];`;
    }
    return `import {${names}} from ${JSON.stringify(location.startsWith('.') ? new URL(location, sourceUrl).href : location)};`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

for (const outcome of ['unmatched', 'failed', 'keep_open', 'api_error', 'confirmed', 'stop', 'no_slot_refill', 'stop_failed']) {
  test(`Obscura check lead → lifecycle → queue bù: ${outcome}`, { skip: !hasNativeBinary, timeout: 15000 }, async t => {
    const sessions = [];
    const events = [];
    const proxy = { server: 'http://127.0.0.1:19999', username: 'fixture', password: 'fixture' };
    let oldSession, refillJob, refillCalls = 0;
    let currentExitIp = '192.0.2.1';
    Object.assign(autoRefill, { enabled: true, stopRequested: false, noSlotRefill: outcome === 'no_slot_refill', queued: false,
      targetCount: 1, sequential: false, deviceProfiles: ['windows', 'ipad'], settings: { browserMode: 'Obscura', websiteUrl: 'https://fixture.invalid/', enableLeadCheck: true } });
    t.after(async () => {
      autoRefill.enabled = false;
      for (const session of sessions) { session.suppressAutoRefill = true; await session.close(); }
      activeBrowsers.clear(); activeProxyLocks.clear(); activeExitIpLocks.clear(); lastClosedObscuraIdentities.clear();
    });
    const { launchRefillBrowsers } = await loadFixtureModule('src/refill/actions/launch-refill-browsers.mjs', {
      launchObscuraBrowsers: async (body, automatic) => {
        assert.equal(automatic, true);
        assert.equal(JSON.parse(body).requestedCount, 1);
        assert.equal(oldSession.isObscuraProcessAlive(), false, 'PID cũ phải dừng trước khi mở PID thay thế');
        assert.equal(activeProxyLocks.has(proxyIdentity(proxy)), false);
        assert.equal(activeExitIpLocks.has('192.0.2.1'), false);
        refillCalls++;
        const previousIdentity = lastClosedObscuraIdentities.get(oldSession.slot);
        assert.ok(previousIdentity, 'Lưu metadata cũ sau khi đã dừng để loại khỏi phiên bù');
        currentExitIp = '192.0.2.2';
        const { session: replacement } = await openObscuraSession({
          proxy: { ...proxy, server: 'http://127.0.0.1:19998' }, tileIndex: oldSession.tileIndex,
          websiteUrl: 'https://fixture.invalid/', usedExitIps: new Set(), onExitIp: async () => {},
          leadConfig: { enabled: true }, shouldAbort: () => false,
          deviceProfile: getNextDeviceProfile(previousIdentity.deviceProfile),
        });
        assert.notEqual(replacement.pid, oldSession.pid);
        assert.notEqual(replacement.profile.id, oldSession.profile.id);
        assert.notEqual(replacement.exitIp, oldSession.exitIp);
        assert.notEqual(replacement.deviceProfile, oldSession.deviceProfile);
        assert.notEqual(getObscuraProfileIdentity(replacement.profile).browserVersion, previousIdentity.browserVersion);
        assert.notEqual(getObscuraProfileIdentity(replacement.profile).deviceFingerprint, previousIdentity.deviceFingerprint);
        sessions.push(replacement); events.push('replacement_started');
        return { results: [], warnings: [] };
      },
    }, t);
    const { queueAutomaticRefill } = await loadFixtureModule('src/refill/actions/queue-automatic-refill.mjs', {
      launchRefillBrowsers, remoteAgents: new Map(),
      enqueueExclusively: handler => { refillJob = Promise.resolve().then(handler); return refillJob; },
    }, t);
    const { openObscuraSession } = await loadFixtureModule('src/obscura-engine/open-obscura-session.mjs', {
      fetchProxyGeo: async () => ({ ip: currentExitIp, timezone: 'UTC', country: 'US' }),
      waitForStableProxyIp: async (proxy, lookup) => lookup(),
      verifyBrowserExitIp: async () => { activeExitIpLocks.add(currentExitIp); return currentExitIp; },
      startAuthenticatedHttpRelay: async () => ({ proxy: null, close: async () => events.push('relay_closed') }),
      startGoLoginSessionRecording: session => Object.assign(session, { addBrowserLog: entry => events.push(entry.type), bindRecordingContext() {}, finishRecording: () => events.push('recording_finished') }),
      takeNextEmail: async () => null,
      initializeObscuraRuntime: async () => {}, decorateGoLoginPages: async () => {}, queueAutomaticRefill,
    }, t);
    activeProxyLocks.add(proxyIdentity(proxy));
    ({ session: oldSession } = await openObscuraSession({ proxy, tileIndex: 996, websiteUrl: 'https://fixture.invalid/',
      usedExitIps: new Set(), onExitIp: async () => {}, leadConfig: { enabled: true }, shouldAbort: () => false }));
    sessions.push(oldSession);
    Object.assign(oldSession, { emailFilled: true, completedScreens: 1 });
    const { startLeadVerification } = await loadFixtureModule('src/leads/actions/start-lead-verification.mjs', {
      fetchLeadDatas: async () => {
        if (outcome === 'api_error') throw new Error('Fixture API unavailable');
        if (outcome === 'stop') { autoRefill.enabled = false; autoRefill.stopRequested = true; }
        return { results: outcome === 'unmatched' ? [{ ip: '198.51.100.2' }] : outcome === 'confirmed' ? [{ ip: '192.0.2.1' }] : [] };
      },
      checkProxyExitIp: async () => '192.0.2.1', tgNotify: async () => {}, saveAndRecordLeadIpStats: () => {},
    }, t);
    const realClose = oldSession.close;
    if (outcome === 'stop_failed') {
      oldSession.close = async () => { throw new Error('Fixture native stop failure'); };
      t.after(() => { oldSession.close = realClose; });
    }
    try {
      await startLeadVerification(oldSession, { enabled: true, intervalSeconds: 1, maxAttempts: 1, autoCloseNoLead: outcome !== 'keep_open' });
      const shouldKeep = ['keep_open', 'api_error', 'confirmed', 'stop_failed'].includes(outcome);
      assert.equal(oldSession.isObscuraProcessAlive(), shouldKeep);
      assert.equal(activeBrowsers.has(oldSession), shouldKeep);
      assert.equal(activeProxyLocks.has(proxyIdentity(proxy)), shouldKeep);
      assert.equal(activeExitIpLocks.has('192.0.2.1'), shouldKeep);
      await refillJob;
      const shouldRefill = ['unmatched', 'failed'].includes(outcome);
      assert.equal(refillCalls, shouldRefill ? 1 : 0);
      assert.equal(autoRefill.targetCount, 1, 'Đóng tự động không giảm target');
      assert.equal(events.filter(event => event === 'recording_finished').length, shouldKeep ? 0 : 1);
      assert.equal(events.includes('obscura_cdp_disconnected'), false, 'Đóng chủ động không đi qua reconnect');
      if (shouldRefill) assert.equal(activeBrowsers.size, 1);
    } finally { oldSession.close = realClose; }
  });
}
