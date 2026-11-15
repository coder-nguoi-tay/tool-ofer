import test from 'node:test';
import assert from 'node:assert/strict';
import { captureLeadWatcherTicks, createLeadTestSession } from './helpers/lead-session-fixture.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { recoverConfirmedLeadErrorPage } from '../src/leads/actions/recover-confirmed-lead-error-page.mjs';
import { protectConfirmedLeadSession } from '../src/leads/actions/protect-confirmed-lead-session.mjs';

const confirmedIp = '198.51.100.55';

test('IP đã có lead gặp trang lỗi: F5 tải lại trang (page.reload), không đóng tab, không đóng browser', async () => {
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  session.confirmedLeadIp = confirmedIp;
  session.leadCheckStatus = 'confirmed';
  page.currentUrl = 'chrome-error://chromewebdata/';

  let reloadCount = 0;
  let autofillScanned = false;

  page.reload = async () => {
    reloadCount++;
    // Giả lập sau khi F5 thì trang trở lại bình thường (200 OK)
    page.currentUrl = 'https://offer.test/survey-screen-2';
    page._uxMainStatus = 200;
    return { status: () => 200 };
  };

  page.triggerAutofillScan = () => {
    autofillScanned = true;
  };

  const recovered = await recoverConfirmedLeadErrorPage(session, page);

  assert.equal(recovered, true);
  assert.equal(reloadCount, 1, 'Phải gọi F5 page.reload() khi gặp lỗi');
  assert.equal(autofillScanned, true, 'Phải kích hoạt lại autofill sau khi F5 thành công');
  assert.equal(page.currentUrl, 'https://offer.test/survey-screen-2');
  assert.equal(counters.pageCloses, 0, 'Tuyệt đối không được đóng tab');
  assert.equal(counters.browserCloses, 0, 'Tuyệt đối không được đóng trình duyệt');
  assert.equal(protectConfirmedLeadSession(session), true, 'Phiên vẫn được bảo vệ lead');
});

test('IP đã có lead gặp lỗi nhưng F5 vẫn lỗi: vẫn giữ nguyên trình duyệt mở, không tự tắt', async () => {
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  session.confirmedLeadIp = confirmedIp;
  session.leadCheckStatus = 'confirmed';
  page.currentUrl = 'chrome-error://chromewebdata/';

  let reloadCount = 0;
  page.reload = async () => {
    reloadCount++;
    // F5 vẫn bị lỗi
    page._uxMainStatus = 502;
    return { status: () => 502 };
  };

  const recovered = await recoverConfirmedLeadErrorPage(session, page);

  assert.equal(recovered, true);
  assert.equal(reloadCount, 1);
  assert.equal(counters.pageCloses, 0, 'Không được tắt tab');
  assert.equal(counters.browserCloses, 0, 'Không được tắt trình duyệt');
  assert.equal(protectConfirmedLeadSession(session), true);
});

// Sự cố 2026-11-15 slot 5 IP 173.19.184.178: đã làm form, trang chính chrome-error, app đóng ngay;
// 28s sau toffers vẫn ghi lead nhưng là lead lỗi. Phiên đã thao tác offer phải được F5/Back phục hồi trước.
test('phiên chưa có lead nhưng đã thao tác form gặp chrome-error: F5 phục hồi, không đóng trình duyệt', async t => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, page, counters } = createLeadTestSession('198.51.100.90');
  session.lastActionTime = Date.now();
  page.currentUrl = 'chrome-error://chromewebdata/';
  let reloads = 0, scans = 0;
  page.reload = async () => { reloads++; page.currentUrl = 'https://offer.test/step-2'; return { status: () => 200 }; };
  page.triggerAutofillScan = () => { scans++; };
  watchTrafficBlockedPage(session);
  ticks[0]();
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(reloads, 1);
  assert.equal(scans, 1);
  assert.equal(counters.browserCloses, 0);
});

test('phiên đã thao tác form: F5/Back lỗi đủ 3 lượt thì mới đóng và bù slot', async t => {
  const ticks = captureLeadWatcherTicks(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const { session, page, counters } = createLeadTestSession('198.51.100.91');
  session.lastActionTime = now;
  page.currentUrl = 'chrome-error://chromewebdata/';
  let reloads = 0;
  page.reload = async () => { reloads++; return null; };
  watchTrafficBlockedPage(session);
  for (let round = 0; round < 4; round++) {
    ticks[0]();
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
    if (round < 3) assert.equal(counters.browserCloses, 0, `lượt ${round + 1} chưa được đóng`);
    now += 16_000;
  }
  assert.equal(reloads, 3);
  assert.equal(counters.browserCloses, 1);
});

test('phiên chưa thao tác gì (proxy lỗi ngay từ đầu) gặp chrome-error: đóng ngay, không F5', async t => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, page, counters } = createLeadTestSession('198.51.100.92');
  page.currentUrl = 'chrome-error://chromewebdata/';
  let reloads = 0;
  page.reload = async () => { reloads++; };
  watchTrafficBlockedPage(session);
  ticks[0]();
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(reloads, 0);
  assert.equal(counters.browserCloses, 1);
});
