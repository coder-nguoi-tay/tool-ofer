import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readUiAsset } from '../src/http/read-ui-asset.mjs';

const helpers = ['get-lead-check-settings', 'select-lead-check-interval', 'toggle-stop-autofill-on-lead'];

/**
 * Dựng giao diện giả và bắt payload Start mà không gọi API hoặc mở trình duyệt thật.
 * @param {string} mode Luồng thường hoặc sequential.
 * @return {object} Checkbox, VM và các lệnh đã gửi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
function createDashboard(mode = 'parallel') {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { checked: false, value: '', disabled: false, textContent: '' });
    return elements.get(id);
  };
  getElement('txtLinkOffer').value = 'https://offer.test/form';
  getElement('cbxAuto').value = mode;
  const requests = [];
  const context = vm.createContext({ window: { cachedSessions: [] }, document: { getElementById: getElement },
    syncOptionPills() {}, switchTab() {}, fetchRunningState() {},
    showWinAlert: message => assert.fail(message), saveOfferConfig: async () => ({ success: true }),
    api: async (path, options) => { requests.push({ path, body: JSON.parse(options.body) }); return {}; },
  });
  for (const name of [...helpers, 'handle-start']) vm.runInContext(readFileSync(new URL(`../ui/desktop/functions/${name}.js`, import.meta.url), 'utf8'), context);
  return { getElement, context, requests };
}

test('một checkbox chờ lead 2×30s; tắt thì bỏ chế độ chỉ hiện khi có lead', () => {
  const { context, getElement } = createDashboard();
  context.selectLeadCheckInterval(30, true);
  assert.equal(getElement('cbxCheckLead').checked, true);
  assert.equal(context.getLeadCheckSettings().leadCheckInterval, 30);
  getElement('cbxHideUntilLead').checked = true;
  context.selectLeadCheckInterval(30, false);
  assert.equal(context.getLeadCheckSettings().enableLeadCheck, false);
  assert.equal(getElement('cbxHideUntilLead').checked, false);
});

for (const mode of ['parallel', 'sequential']) {
  for (const enabled of [true, false]) {
    test(`Start ${mode}: ${enabled ? 'chờ lead 2×30s' : 'không chờ lead'} truyền đúng thời gian và hai lượt kiểm tra`, async () => {
      const { context, requests } = createDashboard(mode);
      if (enabled) context.selectLeadCheckInterval(30, true);
      await context.handleStart();
      assert.equal(requests.length, 1);
      const payload = mode === 'sequential' ? requests[0].body.settings : requests[0].body;
      assert.equal(payload.enableLeadCheck, enabled);
      assert.equal(payload.autoCloseNoLead, enabled);
      assert.equal(payload.leadCheckInterval, 30);
      assert.equal(payload.leadCheckMaxAttempts, 2);
      assert.equal(payload.stopAutofillOnLead, false);
      assert.equal('useCloakBrowser' in payload, false, 'Không còn gửi tuỳ chọn CloakBrowser');
    });
  }
}

for (const mode of ['parallel', 'sequential']) {
  test(`dừng sau lead ${mode}: tự bật chờ 2×30s, bỏ tick trở về logic thường`, async () => {
    const { context, getElement, requests } = createDashboard(mode);
    context.toggleStopAutofillOnLead(true);
    assert.equal(context.getLeadCheckSettings().enableLeadCheck, true);
    assert.equal(context.getLeadCheckSettings().leadCheckInterval, 30);
    await context.handleStart();
    const payload = mode === 'sequential' ? requests[0].body.settings : requests[0].body;
    assert.equal(payload.stopAutofillOnLead, true);
    assert.equal(payload.leadCheckInterval, 30);
    context.toggleStopAutofillOnLead(false);
    assert.equal(context.getLeadCheckSettings().stopAutofillOnLead, false);
    context.toggleStopAutofillOnLead(true);
    context.selectLeadCheckInterval(30, false);
    assert.equal(getElement('cbxStopAutofillOnLead').checked, false);
  });
}

test('HTML không còn ô 2×20s và CloakBrowser; chỉ hiện khi có lead tự bật chờ 2×30s; manifest và bundle hợp lệ', async () => {
  const html = readFileSync(new URL('../ui/desktop/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /cbxCheckLead20|2×20s|CloakBrowser|cbxCloakBrowser/);
  const handler = html.match(/id="cbxHideUntilLead"\s+onchange="([^"]+)"/)[1];
  const { context, getElement } = createDashboard();
  context.hideToggle = { checked: true };
  vm.runInContext(`(function(){${handler}}).call(hideToggle)`, context);
  assert.equal(context.getLeadCheckSettings().leadCheckInterval, 30);
  assert.equal(getElement('cbxCheckLead').checked, true);
  const assets = JSON.parse(readFileSync(new URL('../ui/assets.json', import.meta.url), 'utf8'));
  for (const name of helpers) assert.ok(assets.includes(`desktop/functions/${name}.js`));
  assert.equal(assets.some(name => name.includes('cloak')), false);
  const bundle = await readUiAsset('desktop/app.js');
  assert.ok(bundle.indexOf('function getLeadCheckSettings(') < bundle.indexOf('async function handleStart('));
  assert.doesNotMatch(bundle, /syncCloakBrowserSetting|cloakbrowser/i);
  assert.doesNotThrow(() => new vm.Script(bundle));
});

for (const mode of ['parallel', 'sequential']) {
  test(`Start ${mode}: ô Chờ tối đa gửi số phút tự tắt phiên (maxRunMinutes), không gửi timeLimit giây cũ`, async () => {
    const { context, getElement, requests } = createDashboard(mode);
    getElement('txtTimeLimit').value = '10';
    await context.handleStart();
    const payload = mode === 'sequential' ? requests[0].body.settings : requests[0].body;
    assert.equal(payload.maxRunMinutes, 10);
    assert.equal('timeLimit' in payload, false);
  });
}
