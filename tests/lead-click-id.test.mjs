import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test, { afterEach } from 'node:test';
import { extractClickIdCandidates } from '../src/lead-check/extract-click-id-candidates.mjs';
import { findSessionLead } from '../src/lead-check/find-session-lead.mjs';
import { captureClickIds } from '../src/browser/gologin/capture-click-ids.mjs';
import { recordObservedExitIp } from '../src/proxy/actions/record-observed-exit-ip.mjs';
import { isExitIpCurrentlyInUse } from '../src/proxy/actions/is-exit-ip-currently-in-use.mjs';
import { startLeadVerification } from '../src/leads/actions/start-lead-verification.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { applicationState } from '../src/runtime/application-state.mjs';
import { leadIpStatsMap } from '../lead-check.mjs';
import { createLeadTestSession } from './helpers/lead-session-fixture.mjs';

const CLICK_ID = 'aB3dE5gH7jK9mN1pQ2';
afterEach(() => {
  activeBrowsers.clear();
  leadIpStatsMap.clear();
  applicationState.saveLeadStatsTimer = null;
});

/**
 * Chạy ngay nhịp chờ 1 giây của vòng kiểm lead, bỏ các timer ghi file.
 * @param {object} context Context của node:test.
 * @return {void} Đã cài đồng hồ giả.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function accelerateLeadCheck(context) {
  context.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    if (delay === 1000) queueMicrotask(callback);
    return 1;
  });
}

test('tách clickid từ query, đường dẫn và URL lồng đã mã hoá; URL hỏng trả rỗng', () => {
  assert.deepEqual(extractClickIdCandidates(`https://offer.test/lp?sub1=${CLICK_ID}&x=1`), [CLICK_ID]);
  assert.deepEqual(extractClickIdCandidates(`https://offer.test/c/${CLICK_ID}/go`), [CLICK_ID]);
  const nested = `https://redirect.test/r?u=${encodeURIComponent(`https://offer.test/?cid=${CLICK_ID}`)}`;
  assert.ok(extractClickIdCandidates(nested).includes(CLICK_ID));
  assert.deepEqual(extractClickIdCandidates(`https://offer.test/?id=${CLICK_ID}9`), [], 'Chuỗi 19 ký tự không phải clickid');
  assert.deepEqual(extractClickIdCandidates('not a url'), []);
});

test('lead khớp clickid được ưu tiên dù IP toffers ghi khác mọi IP của phiên', () => {
  const data = { results: [{ ip: '198.51.100.7', clickid: 'zzzzzzzzzzzzzzzzzz' }, { ip: '203.0.113.9', clickid: CLICK_ID }] };
  const lead = findSessionLead(data, { clickIds: [CLICK_ID], ips: ['198.51.100.7'] });
  assert.equal(lead.by, 'clickid');
  assert.equal(lead.ip, '203.0.113.9');
});

test('không có clickid thì dự phòng theo mọi IP của phiên, kể cả dữ liệu dạng chuỗi', () => {
  const data = JSON.stringify({ results: [{ ip: '203.0.113.20', clickid: 'other' }] });
  assert.deepEqual(findSessionLead(data, { clickIds: [CLICK_ID], ips: ['198.51.100.1', '203.0.113.20'] }).by, 'ip');
  assert.equal(findSessionLead(data, { clickIds: [CLICK_ID], ips: ['198.51.100.1'] }), null);
  assert.equal(findSessionLead({ results: [] }, { clickIds: [CLICK_ID], ips: ['198.51.100.1'] }), null);
});

test('bắt clickid ở mọi bước redirect điều hướng, bỏ qua request tài nguyên', () => {
  const context = new EventEmitter();
  const session = {};
  captureClickIds(session, context);
  const request = (url, navigation) => ({ url: () => url, isNavigationRequest: () => navigation });
  context.emit('request', request(`https://toffers.test/click/?key=1`, true));
  context.emit('request', request(`https://offer.test/?aff_sub=${CLICK_ID}`, true));
  context.emit('request', request(`https://cdn.test/app.js?v=ZZZZZZZZZZZZZZZZZZ`, false));
  assert.deepEqual([...session.clickIds], [CLICK_ID]);
});

test('IP phụ của phiên được ghi lịch sử như đã dùng và tính là đang dùng', async () => {
  const writes = [];
  const session = { exitIp: '198.51.100.1', exitIps: new Set(['198.51.100.1']), proxy: { server: 'http://gw.test:1000' }, websiteUrl: 'https://offer.test/' };
  const io = { read: async () => ({ version: 1, proxies: {} }), persist: async history => writes.push(history) };
  assert.equal(await recordObservedExitIp(session, '203.0.113.5', io), true);
  assert.equal(await recordObservedExitIp(session, '203.0.113.5', io), false, 'IP đã có không ghi lại');
  assert.equal(await recordObservedExitIp(session, null, io), false);
  assert.equal(writes.length, 1);
  const [entry] = Object.values(writes[0].proxies);
  assert.equal(entry.exitIp, '203.0.113.5');
  assert.equal(entry.status, 'success');
  activeBrowsers.add(session);
  assert.equal(isExitIpCurrentlyInUse('203.0.113.5'), true);
});

test('lead khớp clickid nhưng toffers ghi IP khác: xác nhận lead, giữ trình duyệt và chuyển sang IP toffers', async t => {
  accelerateLeadCheck(t);
  const { session, counters } = createLeadTestSession('198.51.100.1');
  session.clickIds = new Set([CLICK_ID]);
  session.exitIps = new Set(['198.51.100.1']);
  const changed = [];
  session.onExitIpChanged = ip => changed.push(ip);
  activeBrowsers.add(session);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [{ ip: '203.0.113.9', clickid: CLICK_ID }] })));
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1 });
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(session.exitIp, '203.0.113.9');
  assert.equal(session.confirmedLeadIp, '203.0.113.9');
  assert.deepEqual(changed, ['203.0.113.9'], 'báo đổi IP để tên profile GoLogin theo IP app');
  assert.ok(session.exitIps.has('203.0.113.9'));
  assert.ok(leadIpStatsMap.has('203.0.113.9'));
  assert.equal(leadIpStatsMap.has('198.51.100.1'), false, 'Một lead chỉ tính một IP');
  assert.equal(counters.browserCloses, 0);
});

test('dự phòng IP: lead về IP phụ của phiên vẫn được xác nhận', async t => {
  accelerateLeadCheck(t);
  const { session, counters } = createLeadTestSession('198.51.100.1');
  session.exitIps = new Set(['198.51.100.1', '203.0.113.20']);
  activeBrowsers.add(session);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [{ ip: '203.0.113.20', clickid: 'other' }] })));
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1 });
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(session.exitIp, '203.0.113.20');
  assert.equal(counters.browserCloses, 0);
});
