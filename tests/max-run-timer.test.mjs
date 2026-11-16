import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { attachMaxRunTimer } from '../src/browser/actions/attach-max-run-timer.mjs';
import { leadIpStatsMap } from '../lead-check.mjs';

afterEach(() => leadIpStatsMap.clear());

/**
 * Phiên giả ghi lại log và số lần bị đóng.
 * @param {object} [extra] Trường bổ sung cho phiên.
 * @return {object} Phiên và bộ đếm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function createSession(extra = {}) {
  const logs = [];
  let closes = 0;
  const session = { exitIp: '198.51.100.30', browser: { close: async () => { closes++; } }, addBrowserLog: entry => logs.push(entry), ...extra };
  return { session, logs, closes: () => closes };
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

test('chạy quá N phút thì ghi log và tắt trình duyệt để bù slot, kể cả offer không chờ lead', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, logs, closes } = createSession();
  attachMaxRunTimer(session, 10);
  t.mock.timers.tick(10 * 60_000 - 1);
  await flush();
  assert.equal(closes(), 0, 'chưa đủ 10 phút thì không tắt');
  t.mock.timers.tick(1);
  await flush();
  assert.equal(closes(), 1);
  assert.equal(logs[0].type, 'max_run_timeout');
  assert.equal(session.closingDueToNoLead, true, 'đóng do app để bù slot, không tính người dùng tự đóng');
  assert.equal(session.suppressAutoRefill, false);
});

test('phiên đã có lead cũng bị tắt khi hết giờ (người dùng chốt 2026-11-16); đánh dấu đóng trước để không bị nối lại', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let closedFlagAtClose = null;
  const { session, logs } = createSession({ leadCheckStatus: 'confirmed', confirmedLeadIp: '198.51.100.30', leadHistoryBaselineAt: 0 });
  session.browser.close = async () => { closedFlagAtClose = session.isClosed; };
  attachMaxRunTimer(session, 10);
  t.mock.timers.tick(10 * 60_000 - 1);
  await flush();
  assert.equal(closedFlagAtClose, null, 'chưa đủ 10 phút');
  t.mock.timers.tick(1);
  await flush();
  assert.equal(closedFlagAtClose, true, 'phiên có lead được đánh dấu đã đóng trước khi tắt (bộ nối lại CDP bỏ qua)');
  assert.equal(logs[0].type, 'max_run_timeout');
  assert.match(logs[0].detail, /có lead/);
  assert.equal(session.suppressAutoRefill, false, 'vẫn bù slot mới');
});

test('bật "dừng autofill khi có lead" và phiên đã có lead: giữ trình duyệt khi hết giờ', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, closes } = createSession({ leadCheckStatus: 'confirmed', confirmedLeadIp: '198.51.100.30', stopAutofillOnLead: true, enableLeadCheck: true, leadHistoryBaselineAt: 0 });
  attachMaxRunTimer(session, 10);
  t.mock.timers.tick(30 * 60_000);
  await flush();
  assert.equal(closes(), 0);
});

test('hết giờ đúng lúc đang chờ lead thì đợi lượt chờ xong rồi mới tắt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, closes } = createSession({ leadCheckRunning: true });
  attachMaxRunTimer(session, 10);
  t.mock.timers.tick(10 * 60_000);
  await flush();
  assert.equal(closes(), 0);
  session.leadCheckRunning = false;
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(closes(), 1);
});

test('0 phút là không giới hạn; phiên đã đóng hoặc đã huỷ hẹn giờ thì không đóng lại', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const unlimited = createSession();
  attachMaxRunTimer(unlimited.session, 0);
  const closed = createSession({ isClosed: true });
  attachMaxRunTimer(closed.session, 1);
  const cancelled = createSession();
  attachMaxRunTimer(cancelled.session, 1)();
  t.mock.timers.tick(60 * 60_000);
  await flush();
  assert.equal(unlimited.closes() + closed.closes() + cancelled.closes(), 0);
});
