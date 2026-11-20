import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

/**
 * Chạy script tab Vận hành của giao diện mini trên DOM giả, bắt các request gửi lên server.
 * @param {object} [globals] Biến toàn cục bổ sung (vd. hàm của tab Cài đặt).
 * @return {object} VM, DOM giả và các request đã gửi.
 * @throws {Error} Khi không thể đọc hoặc nạp script giao diện vào VM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function createMini(globals = {}) {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { id, checked: false, value: '', textContent: '', style: {}, classList: { toggle() {} }, addEventListener(type, handler) { this[type] = handler; } });
    return elements.get(id);
  };
  getElement('inputWebsiteUrl').value = 'https://offer.test/form';
  getElement('inputTimeLimit').value = '10';
  const requests = [];
  const context = vm.createContext({
    document: { getElementById: getElement }, window: {}, activeSessions: [], inputThreadCount: { value: '2' }, currentBrowserMode: 'Chrome',
    showToast() {}, pollState: async () => {}, syncOptionPills() {}, loadSavedOffers: async () => {}, alert: message => assert.fail(message), tg: null,
    setInterval: () => 1, clearInterval() {}, setTimeout,
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { json: async () => ({ success: true }) }; },
    ...globals,
  });
  for (const file of ['functions/load-last-launch-settings.js', 'features/run/run-tools.js', 'setup/window-set-browser-mode-mode.js', 'setup/btn-start-launch-click.js']) {
    vm.runInContext(readFileSync(new URL(`../ui/mini/${file}`, import.meta.url), 'utf8'), context);
  }
  const launch = () => requests.find(request => request.url === '/launch' || request.url === '/auto-refill/sequential');
  return { context, getElement, requests, launch };
}

test('mini chọn GoLogin, gửi Chờ tối đa (phút), Dừng autofill khi có lead, anti-fp và thiết bị từ tab Cài đặt', async () => {
  const overrides = { antiFpCanvas: false, antiFpClientRects: true, antiFpWebgl: true, antiFpFonts: true, antiFpWebrtc: true, antiFpApiFakeIP: false, gologinDevices: ['windows11'] };
  const { context, getElement, requests, launch } = createMini({ miniSetGetLaunchOverrides: () => overrides });
  context.window.setBrowserMode('GoLogin');
  assert.equal(getElement('radioGoLogin').checked, true);
  assert.equal(getElement('badgeBrowserMode').textContent, '🚀 GoLogin Orbita');
  getElement('cbxStopAutofillOnLead').checked = true;
  await getElement('btnStartLaunch').click();
  assert.equal(requests[0].url, '/pc/offer/save', 'tự lưu offer trước khi chạy');
  const { url, body } = launch();
  assert.equal(url, '/launch');
  assert.equal(body.useGoLogin, true);
  assert.equal(body.browserMode, 'GoLogin');
  assert.deepEqual(body.gologinDevices, ['windows11']);
  assert.equal(body.antiFpCanvas, false);
  assert.equal(body.antiFpApiFakeIP, false);
  assert.equal(body.maxRunMinutes, 10);
  assert.equal('timeLimit' in body || 'aiAssist' in body || 'saveRRS' in body || 'useAdsPower' in body, false, 'không gửi trường server bỏ qua');
  assert.equal(body.stopAutofillOnLead, true);
  assert.equal(body.enableLeadCheck, true, 'Dừng autofill khi có lead cần chờ lead 2×30s');
});

test('mini: AdsPower cũ quay về Chrome; Link 1 nhiều dòng; nhập proxy kèm giao thức trước khi chạy', async () => {
  const { context, getElement, requests, launch } = createMini();
  context.window.setBrowserMode('AdsPower');
  assert.equal(getElement('radioChrome').checked, true);
  getElement('inputWebsiteUrl').value = 'https://a.test/1\nhttps://a.test/2, https://a.test/1';
  getElement('taProxyInput').value = 'host:1:user:pass';
  getElement('resProxyType').value = 'http';
  await getElement('btnStartLaunch').click();
  assert.deepEqual(requests.find(request => request.url === '/proxy-queue/import').body, { proxyList: 'host:1:user:pass', proxyType: 'http' });
  const { body } = launch();
  assert.equal(body.useGoLogin, false);
  assert.equal(body.browserMode, 'Chrome');
  assert.deepEqual(body.offerUrls, ['https://a.test/1', 'https://a.test/2']);
  assert.equal(body.proxyType, 'http');
});

test('mini chạy tuần tự gửi /auto-refill/sequential; hẹn giờ thì chưa chạy ngay', async () => {
  const sequential = createMini();
  sequential.getElement('miniRunMode').value = 'sequential';
  await sequential.getElement('btnStartLaunch').click();
  const { url, body } = sequential.launch();
  assert.equal(url, '/auto-refill/sequential');
  assert.equal(body.enabled, true);
  assert.equal(body.settings.websiteUrl, 'https://offer.test/form');

  const scheduled = createMini();
  scheduled.getElement('miniSchedOn1').checked = true;
  scheduled.getElement('miniSchedTime1').value = '07:00';
  await scheduled.getElement('btnStartLaunch').click();
  assert.equal(scheduled.launch(), undefined, 'đang chờ tới giờ hẹn');
  assert.equal(scheduled.getElement('miniScheduleBanner').style.display, 'flex');
});

test('payload lưu offer của mini đủ trường như app chính', () => {
  const { context, getElement } = createMini();
  getElement('cbxHideUntilLead').checked = true;
  getElement('miniSchedOn2').checked = true;
  getElement('miniSchedTime2').value = '09:30';
  const payload = context.miniRunBuildOfferPayload();
  assert.equal(payload.HideUntilLead, true);
  assert.equal(payload.MaxRunMinutes, '10');
  assert.deepEqual(JSON.parse(JSON.stringify(payload.schedules[1])), { offerIndex: 2, enabled: true, time: '09:30' });
  assert.equal(payload.methodConfigs.length, 4);
  assert.equal(payload.methodConfigs[0].mode, 'auto_full');
});

test('tới giờ hẹn Offer 2 chỉ chạy link của Offer 2; đang chạy thì bỏ qua lượt hẹn', async () => {
  const { context, getElement, launch } = createMini();
  getElement('inputWebsiteUrl').value = 'https://a.test/1\nhttps://a.test/1b';
  getElement('inputWebsiteUrl2').value = 'https://a.test/2';
  await context.miniRunStart({ executeSchedule: true, offerIndex: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(launch().body.offerUrls)), ['https://a.test/2']);

  const first = createMini();
  first.getElement('inputWebsiteUrl').value = 'https://a.test/1\nhttps://a.test/1b';
  await first.context.miniRunStart({ executeSchedule: true, offerIndex: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(first.launch().body.offerUrls)), ['https://a.test/1', 'https://a.test/1b']);

  const busy = createMini({ activeSessions: [{ slot: 1 }] });
  await busy.context.miniRunStart({ executeSchedule: true, offerIndex: 2 });
  assert.equal(busy.launch(), undefined);
});
