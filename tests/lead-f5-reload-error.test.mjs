import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeadTestSession } from './helpers/lead-session-fixture.mjs';
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
