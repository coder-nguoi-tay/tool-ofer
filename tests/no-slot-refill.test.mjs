import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.AUTOLEADPC_DATA_DIR = `AutoLeadPC-tests-no-slot-refill-${process.pid}`;
const { appDataDirectory } = await import('../src/config/paths.mjs');
const { autoRefill } = await import('../src/runtime/constants/auto-refill.mjs');
const { activeBrowsers } = await import('../src/browser/sessions.mjs');
const { noSlotRefillSettingsPath } = await import('../src/runtime/constants/no-slot-refill-settings-path.mjs');
const { updateNoSlotRefill } = await import('../src/refill/actions/update-no-slot-refill.mjs');
const { loadNoSlotRefillSettings } = await import('../src/refill/actions/load-no-slot-refill-settings.mjs');
const { queueAutomaticRefill } = await import('../src/refill/actions/queue-automatic-refill.mjs');
const { prepareManualBrowserClose } = await import('../src/browser/actions/prepare-manual-browser-close.mjs');
const { getAutoRefillStatus } = await import('../src/refill/actions/get-auto-refill-status.mjs');
const { readUiAsset } = await import('../src/http/read-ui-asset.mjs');

after(() => rm(appDataDirectory, { recursive: true, force: true }));

test('Không bù slot được lưu và khôi phục độc lập trạng thái Start/Stop', async t => {
  const previous = { ...autoRefill };
  t.after(() => Object.assign(autoRefill, previous));
  await mkdir(appDataDirectory, { recursive: true });
  Object.assign(autoRefill, { enabled: false, settings: null, noSlotRefill: false });

  const enabled = await updateNoSlotRefill(JSON.stringify({ noSlotRefill: true }));
  assert.equal(enabled.noSlotRefill, true);
  assert.equal(autoRefill.enabled, false);
  assert.deepEqual(JSON.parse(await readFile(noSlotRefillSettingsPath, 'utf8')), { noSlotRefill: true });

  autoRefill.noSlotRefill = false;
  await loadNoSlotRefillSettings();
  assert.equal(autoRefill.noSlotRefill, true);

  const disabled = await updateNoSlotRefill(JSON.stringify({ noSlotRefill: false }));
  assert.equal(disabled.noSlotRefill, false);
  assert.deepEqual(JSON.parse(await readFile(noSlotRefillSettingsPath, 'utf8')), { noSlotRefill: false });
  await assert.rejects(() => updateNoSlotRefill(JSON.stringify({ noSlotRefill: 'yes' })), /true hoặc false/);
});

test('thiếu slot nhưng bật Không bù slot thì không xếp hàng mở browser và giữ target', t => {
  const previous = { ...autoRefill };
  t.after(() => { Object.assign(autoRefill, previous); activeBrowsers.clear(); });
  activeBrowsers.clear();
  Object.assign(autoRefill, {
    enabled: true,
    stopRequested: false,
    noSlotRefill: true,
    queued: false,
    targetCount: 3,
    settings: { websiteUrl: 'https://offer.test/form', browserMode: 'Chrome' }
  });

  queueAutomaticRefill();
  assert.equal(autoRefill.queued, false);
  assert.equal(getAutoRefillStatus().noSlotRefill, true);

  const session = { enableLeadCheck: false, suppressAutoRefill: false };
  assert.equal(prepareManualBrowserClose(session), false);
  assert.equal(session.suppressAutoRefill, true);
  assert.equal(autoRefill.targetCount, 3);
});

test('checkbox Không bù slot gọi đúng API và có mặt trong bundle desktop', async () => {
  const checkbox = { checked: false, disabled: false };
  const requests = [];
  const messages = [];
  const context = vm.createContext({
    document: { getElementById: id => id === 'cbxNoSlotRefill' ? checkbox : null },
    api: async (path, options) => {
      const body = JSON.parse(options.body);
      requests.push({ path, options, body });
      return { noSlotRefill: body.noSlotRefill };
    },
    showToast: message => messages.push(message),
    showWinAlert: message => assert.fail(message),
    syncOptionPills() {}
  });
  vm.runInContext(readFileSync(new URL('../ui/desktop/functions/toggle-no-slot-refill.js', import.meta.url), 'utf8'), context);
  await context.toggleNoSlotRefill(true);
  await context.toggleNoSlotRefill(false);
  assert.deepEqual(requests.map(({ path, body }) => ({ path, body })), [
    { path: '/auto-refill/no-slot-refill', body: { noSlotRefill: true } },
    { path: '/auto-refill/no-slot-refill', body: { noSlotRefill: false } }
  ]);
  assert.equal(checkbox.disabled, false);
  assert.equal(messages.length, 2);

  const html = readFileSync(new URL('../ui/desktop/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="cbxNoSlotRefill" onchange="toggleNoSlotRefill\(this\.checked\)"/);
  const assets = JSON.parse(readFileSync(new URL('../ui/assets.json', import.meta.url), 'utf8'));
  assert.ok(assets.includes('desktop/functions/toggle-no-slot-refill.js'));
  const bundle = await readUiAsset('desktop/app.js');
  assert.ok(bundle.includes('function toggleNoSlotRefill('));
  assert.ok(bundle.includes('state.noSlotRefill'));
  assert.doesNotThrow(() => new vm.Script(bundle));
});
