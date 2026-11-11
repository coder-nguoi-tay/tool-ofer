import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { observeLeadsAfterEmail, LEAD_OBSERVE_WINDOW_MS } from '../src/leads/actions/observe-leads-after-email.mjs';
import { protectConfirmedLeadSession } from '../src/leads/actions/protect-confirmed-lead-session.mjs';
import { refreshToffersOverview } from '../src/leads/toffers-overview/refresh-toffers-overview.mjs';
import { getAutoRefillStatus } from '../src/refill/actions/get-auto-refill-status.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';

afterEach(() => activeBrowsers.clear());

/**
 * Phiên không tick Check Lead, đã nhập email; ghi lại log để kiểm tra.
 * @param {string} exitIp IP thoát của phiên.
 * @param {object} [extra] Field ghi đè.
 * @return {object} Phiên giả.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function observedSession(exitIp, extra = {}) {
  const logs = [];
  return { enableLeadCheck: false, emailFilled: true, exitIp, offerNumber: 1, logs, addBrowserLog: entry => logs.push(entry), ...extra };
}

const overviewWith = (...ips) => ({ success: true, results: ips.map(ip => ({ ip })) });

test('theo dõi lead: IP có trong danh sách lead → found, ghi log và báo Telegram một lần', () => {
  const session = observedSession('198.51.100.61');
  const notes = [];
  const notify = text => notes.push(text);
  observeLeadsAfterEmail(overviewWith('198.51.100.61'), { sessions: [session], now: 1000, notify });
  assert.equal(session.leadObserveStatus, 'found');
  assert.match(session.leadObserveMessage, /Có lead/);
  assert.equal(session.logs.at(-1).type, 'lead_observed');
  assert.equal(notes.length, 1);
  assert.match(notes[0], /198\.51\.100\.61/);
  observeLeadsAfterEmail(overviewWith('198.51.100.61'), { sessions: [session], now: 2000, notify });
  assert.equal(notes.length, 1);
});

test('theo dõi lead: chưa thấy → waiting; hết 10 phút kể từ lúc bắt đầu → not_found', () => {
  const session = observedSession('198.51.100.62');
  const notify = () => assert.fail('không được báo khi không có lead');
  observeLeadsAfterEmail(overviewWith('203.0.113.1'), { sessions: [session], now: 0, notify });
  assert.equal(session.leadObserveStatus, 'waiting');
  observeLeadsAfterEmail(overviewWith(), { sessions: [session], now: LEAD_OBSERVE_WINDOW_MS - 1, notify });
  assert.equal(session.leadObserveStatus, 'waiting');
  observeLeadsAfterEmail(overviewWith(), { sessions: [session], now: LEAD_OBSERVE_WINDOW_MS, notify });
  assert.equal(session.leadObserveStatus, 'not_found');
  assert.equal(LEAD_OBSERVE_WINDOW_MS, 600_000);
});

test('theo dõi lead: bỏ qua phiên chưa nhập email, phiên tick Check Lead, phiên chưa có IP', () => {
  const noEmail = observedSession('198.51.100.63', { emailFilled: false });
  const ticked = observedSession('198.51.100.64', { enableLeadCheck: true, leadCheckStatus: 'checking' });
  const noIp = observedSession(null);
  observeLeadsAfterEmail(overviewWith('198.51.100.63', '198.51.100.64'), { sessions: [noEmail, ticked, noIp], now: 0, notify: () => {} });
  assert.equal(noEmail.leadObserveStatus, undefined);
  assert.equal(ticked.leadObserveStatus, undefined);
  assert.equal(ticked.leadCheckStatus, 'checking');
  assert.equal(noIp.leadObserveStatus, undefined);
});

test('theo dõi lead: API lỗi → api_error, không kết luận; lần sau có lead → found', () => {
  const session = observedSession('198.51.100.65');
  observeLeadsAfterEmail({ success: false, results: [], error: 'Cookie hết hạn' }, { sessions: [session], now: 0, notify: () => {} });
  assert.equal(session.leadObserveStatus, 'api_error');
  assert.match(session.leadObserveMessage, /Cookie hết hạn/);
  observeLeadsAfterEmail(overviewWith('198.51.100.65'), { sessions: [session], now: 10_000, notify: () => {} });
  assert.equal(session.leadObserveStatus, 'found');
});

test('theo dõi lead: trình duyệt đã đóng vẫn được đối chiếu tới hết cửa sổ', () => {
  const session = observedSession('198.51.100.66');
  observeLeadsAfterEmail(overviewWith(), { sessions: [session], now: 0, notify: () => {} });
  session.isClosed = true;
  const notes = [];
  observeLeadsAfterEmail(overviewWith('198.51.100.66'), { sessions: [], now: 60_000, notify: text => notes.push(text) });
  assert.equal(session.leadObserveStatus, 'found');
  assert.equal(notes.length, 1);
});

test('theo dõi lead: có lead khóa bảo vệ đúng IP, không bật checkbox chờ', () => {
  const session = observedSession('198.51.100.67');
  observeLeadsAfterEmail(overviewWith('198.51.100.67'), { sessions: [session], now: 0, notify: () => {} });
  assert.equal(session.leadObserveStatus, 'found');
  assert.equal(protectConfirmedLeadSession(session), true);
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(session.enableLeadCheck, false);
  session.leadCheckStatus = 'checking';
  assert.equal(protectConfirmedLeadSession(session), true);
  session.exitIp = '198.51.100.200';
  assert.equal(protectConfirmedLeadSession(session), false);
});

test('poll toffers nền đối chiếu lead cho phiên đang chạy', async t => {
  const session = observedSession('198.51.100.68', { browser: { pages: () => [] } });
  activeBrowsers.add(session);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [{ ip: '198.51.100.68' }] })));
  await refreshToffersOverview();
  assert.equal(session.leadObserveStatus, 'found');
});

test('trạng thái slot trả kèm kết quả theo dõi lead', async () => {
  const session = observedSession('198.51.100.69', { leadObserveStatus: 'waiting', leadObserveMessage: 'Đang chờ lead', chromeVersion: '140.0.0.0', slot: 1, tileIndex: 0, browser: { pages: () => [] } });
  activeBrowsers.add(session);
  const status = await getAutoRefillStatus();
  assert.match(JSON.stringify(status), /"leadObserveStatus":"waiting","leadObserveMessage":"Đang chờ lead"/);
});
