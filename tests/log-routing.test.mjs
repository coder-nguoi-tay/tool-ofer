import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { startLeadVerification } from '../src/leads/actions/start-lead-verification.mjs';
import { browserSessionLogs } from '../src/logging/browser-logs.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';
import { createLeadTestSession, captureLeadWatcherTicks } from './helpers/lead-session-fixture.mjs';

afterEach(() => {
  activeBrowsers.clear();
  autoRefill.enabled = false;
});

/**
 * Gắn addBrowserLog giả và mảng log thô: sự kiện phải đi qua addBrowserLog (gán id, gộp, chụp bằng chứng),
 * không được đẩy thẳng vào mảng thô.
 * @param {object} session Phiên giả.
 * @return {{events: object[], raw: object[]}} Sự kiện qua addBrowserLog và mảng thô.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function routeLogs(session) {
  const events = [];
  const raw = [];
  session.addBrowserLog = entry => { events.push(entry); return entry; };
  browserSessionLogs.set(session, raw);
  return { events, raw };
}

test('watcher: sự kiện đóng phiên vì lỗi mạng đi qua addBrowserLog, không đẩy thẳng mảng log', async t => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, page, counters } = createLeadTestSession('198.51.100.80');
  const { events, raw } = routeLogs(session);
  page.currentUrl = 'chrome-error://chromewebdata/';
  watchTrafficBlockedPage(session);
  ticks[0]();
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(counters.browserCloses, 1);
  assert.ok(events.some(event => event.type === 'traffic_blocked' && /Lỗi mạng/.test(event.detail)), JSON.stringify(events));
  assert.equal(raw.length, 0);
});

test('check lead: đóng phiên vì không có lead đi qua addBrowserLog', async t => {
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    if (delay === 1000) queueMicrotask(callback);
    return 1;
  });
  const { session } = createLeadTestSession('198.51.100.81');
  activeBrowsers.add(session);
  const { events, raw } = routeLogs(session);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [] })));
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1 });
  assert.ok(events.some(event => event.type === 'lead_failed' && event.ip === '198.51.100.81'), JSON.stringify(events));
  assert.equal(raw.length, 0);
});

test('check lead: tắt tự đóng khi hết lead — log giữ mở đi qua addBrowserLog', async t => {
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    if (delay === 1000) queueMicrotask(callback);
    return 1;
  });
  const { session } = createLeadTestSession('198.51.100.82');
  activeBrowsers.add(session);
  const { events, raw } = routeLogs(session);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [] })));
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1, autoCloseNoLead: false });
  assert.ok(events.some(event => event.type === 'lead_failed_keep_open'), JSON.stringify(events));
  assert.equal(raw.length, 0);
});
