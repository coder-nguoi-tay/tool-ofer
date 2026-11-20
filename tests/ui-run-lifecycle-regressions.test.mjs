import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { normalizeOfferRunOptions } from '../src/config/normalize-offer-run-options.mjs';

/**
 * Nạp function sản xuất vào VM với I/O được thay bằng fixture; không mở browser thật.
 * @param {object} context VM globals. @param {string} file Đường dẫn module.
 * @return {void} Function được gắn vào context.
 * @author ductv <ductv@getflycrm.com> @since 2026-11-18
 */
function load(context, file) {
  const code = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/export (?=(?:async )?function)/g, '');
  vm.runInContext(code, context, { filename: file });
}

/**
 * Read cap constants in a clean child process so module-load environment parsing is isolated.
 * @param {object} [overrides={}] Environment values for the two cap variables.
 * @return {{alive: number, concurrency: number}} Parsed finite cap values.
 * @throws {Error} When the child process or its JSON output is invalid.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function readRuntimeCaps(overrides = {}) {
  const aliveUrl = new URL('../src/runtime/constants/max-alive-browsers.mjs', import.meta.url).href;
  const concurrencyUrl = new URL('../src/runtime/constants/max-concurrent-profiles.mjs', import.meta.url).href;
  const environment = { ...process.env };
  delete environment.AUTOLEADPC_MAX_ALIVE;
  delete environment.AUTOLEADPC_CONCURRENCY;
  Object.assign(environment, overrides);
  const script = `import { maxAliveBrowsers } from ${JSON.stringify(aliveUrl)}; import { maxConcurrentProfiles } from ${JSON.stringify(concurrencyUrl)}; console.log(JSON.stringify({ alive: maxAliveBrowsers, concurrency: maxConcurrentProfiles }));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { env: environment, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Không đọc được cap runtime.');
  return JSON.parse(result.stdout.trim());
}

/**
 * Verify every supported browser launcher rejects counts above a child-process cap.
 * @param {number} cap Configured AUTOLEADPC_MAX_ALIVE value.
 * @param {string} requestedCount Count supplied to each launcher.
 * @param {string} [expectedError] Expected normalized rejection message.
 * @return {void} All five launcher paths rejected the request before API/browser work.
 * @throws {Error} When the child process reports a missing or inconsistent rejection.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function verifyLauncherCountCap(cap, requestedCount, expectedError = `Chỉ được mở tối đa ${cap} phiên trình duyệt cùng lúc.`) {
  const root = new URL('../', import.meta.url).pathname;
  const environment = { ...process.env, AUTOLEADPC_MAX_ALIVE: String(cap), AUTOLEADPC_CONCURRENCY: '2' };
  const script = `
    const [{ launchRequestedBrowsers }, { launchObscuraBrowsers }, { launchAdsPowerBrowsers }, { launchGoLoginBrowsers }, { launchMultiloginBrowsers }] = await Promise.all([
      import('./src/browser/actions/launch-requested-browsers.mjs'),
      import('./src/browser/actions/launch-obscura-browsers.mjs'),
      import('./src/browser/actions/launch-ads-power-browsers.mjs'),
      import('./src/browser/actions/launch-gologin-browsers.mjs'),
      import('./src/browser/actions/launch-multilogin-browsers.mjs'),
    ]);
    const request = count => JSON.stringify({ requestedCount: count, concurrency: count, websiteUrl: 'https://fixture.invalid/' });
    const launchers = [
      ['Chrome', () => launchRequestedBrowsers(request(${JSON.stringify(requestedCount)}))],
      ['Obscura', () => launchObscuraBrowsers(request(${JSON.stringify(requestedCount)}))],
      ['AdsPower', () => launchAdsPowerBrowsers(request(${JSON.stringify(requestedCount)}))],
      ['GoLogin', () => launchGoLoginBrowsers(request(${JSON.stringify(requestedCount)}))],
      ['Multilogin', () => launchMultiloginBrowsers(request(${JSON.stringify(requestedCount)}))],
    ];
    const errors = [];
    for (const [name, launch] of launchers) {
      try { await launch(); throw new Error(name + ' accepted an over-cap count'); }
      catch (error) { errors.push(name + ': ' + error.message); }
    }
    const expected = ${JSON.stringify(expectedError)};
    if (errors.some(error => !error.endsWith(expected))) throw new Error(errors.join(' | '));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: root, env: environment, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Launcher count cap test failed.');
}

/**
 * Check finite runtime defaults and normalization for malformed environment overrides.
 * @param {void} None.
 * @return {void} Resolves after the environment parsing assertions pass.
 * @throws {AssertionError} When a cap is non-finite or parses an unsafe override.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function verifyRuntimeCapDefaults() {
  assert.deepEqual(readRuntimeCaps(), { alive: 30, concurrency: 30 });
  assert.deepEqual(readRuntimeCaps({ AUTOLEADPC_MAX_ALIVE: '31', AUTOLEADPC_CONCURRENCY: '7' }), { alive: 31, concurrency: 7 });
  assert.deepEqual(readRuntimeCaps({ AUTOLEADPC_MAX_ALIVE: '1000', AUTOLEADPC_CONCURRENCY: '1e2' }), { alive: 256, concurrency: 30 });
  for (const invalid of ['', '1.5', '1e2', '12suffix', '-2', '9007199254740992']) {
    assert.deepEqual(readRuntimeCaps({ AUTOLEADPC_MAX_ALIVE: invalid, AUTOLEADPC_CONCURRENCY: invalid }), { alive: 30, concurrency: 30 }, invalid);
  }
}
test('Cap runtime hữu hạn, mặc định 30 và chuẩn hóa override không an toàn', verifyRuntimeCapDefaults);

/**
 * Check cap enforcement and strict parsing across Chrome, Obscura and managed-browser launchers.
 * @param {void} None.
 * @return {void} Resolves after default and explicitly lowered cap cases pass.
 * @throws {Error} When any launcher accepts or inconsistently rejects an over-cap count.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function verifyAllLauncherCountCaps() {
  verifyLauncherCountCap(30, '31');
  verifyLauncherCountCap(2, '3');
  verifyLauncherCountCap(30, '1.5', 'Số trình duyệt cần mở phải là số nguyên dương.');
  verifyLauncherCountCap(30, '1e2', 'Số trình duyệt cần mở phải là số nguyên dương.');
  verifyLauncherCountCap(30, '12suffix', 'Số trình duyệt cần mở phải là số nguyên dương.');
  verifyLauncherCountCap(30, '-2', 'Số trình duyệt cần mở phải là số nguyên dương.');
  verifyLauncherCountCap(30, '', 'Số trình duyệt cần mở phải là số nguyên dương.');
  verifyLauncherCountCap(30, '9007199254740992');
}
test('Chrome, Obscura, AdsPower, GoLogin và Multilogin cùng tôn trọng cap được cấu hình', verifyAllLauncherCountCaps);

/**
 * Normalize the route fixture count with the production default cap.
 * @param {string|number} value Requested count from the mocked request.
 * @return {number} Bounded positive integer.
 * @throws {Error} When the fixture request is malformed or above 30.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function normalizeFixtureRequestedCount(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) throw new Error('Số trình duyệt cần mở phải là số nguyên dương.');
  const digits = raw.replace(/^0+(?=\d)/, '');
  if (digits.length > 2 || digits.length === 2 && digits > '30') throw new Error('Chỉ được mở tối đa 30 phiên trình duyệt cùng lúc.');
  return Number(digits);
}

/**
 * Tạo hàng đợi bù dùng deferred promises để tái hiện Stop/Start trong khi còn I/O.
 * @return {object} Context và các lượt mở có thể chủ động hoàn tất.
 * @throws {Error} Khi fixture source không thể nạp.
 * @author ductv <ductv@getflycrm.com> @since 2026-11-18
 */
function refillFixture() {
  const jobs = [], delayed = [], launches = [], browsers = [];
  const state = { enabled: true, stopRequested: false, noSlotRefill: false, targetCount: 1,
    queued: false, settings: { websiteUrl: 'https://fixture.invalid/old' } };
  const context = vm.createContext({ autoRefill: state, activeBrowsers: new Set(), maxAliveBrowsers: 30,
    normalizeRequestedBrowserCount: normalizeFixtureRequestedCount,
    countLiveBrowsers: () => browsers.length, getLiveBrowsers: () => [...browsers],
    normalizeUrl: value => value, pruneStaleAgents() {}, remoteAgents: new Map(), offerStrategyState: new Map(),
    setTimeout: (resolve, milliseconds) => milliseconds === 800 ? queueMicrotask(resolve) : delayed.push(resolve),
    pendingObscuraSessions: new Set(), activeProxyLocks: new Set(), activeExitIpLocks: new Set(),
    applicationState: { exclusiveQueue: Promise.resolve() }, autoRefillSettingsPath: '/unused',
    cancelAutoStop() {}, stopAllContinuousAgents() {}, writeFile: async () => {},
    executeFile: async () => {}, readAdsPowerApiKey: async () => null,
    enqueueExclusively(handler) { jobs.push(handler); return Promise.resolve(); },
    launchRefillBrowsers(body) { return new Promise(resolve => launches.push({ body: JSON.parse(body), resolve })); },
  });
  load(context, 'src/refill/actions/invalidate-refill-jobs.mjs');
  load(context, 'src/refill/actions/queue-automatic-refill.mjs');
  load(context, 'src/browser/actions/close-active-browsers.mjs');
  return { context, state, jobs, delayed, launches, browsers };
}

test('Stop thu hồi job đang chờ; kết quả muộn không nhả khóa hay ghi đè message của lượt mới', async () => {
  const { context, state, jobs, launches } = refillFixture();
  context.queueAutomaticRefill();
  const oldResult = jobs.shift()();
  assert.equal(launches.length, 1);
  const stopping = context.closeActiveBrowsers();
  assert.equal(state.isStopping, true);
  load(context, 'src/browser/actions/launch-user-requested-browsers.mjs');
  await assert.rejects(() => context.launchUserRequestedBrowsers('{}'), /đang dừng/);
  await stopping;
  assert.equal(state.isStopping, false);
  assert.equal(state.stopRequested, true);
  assert.equal(state.isRefilling, false);
  Object.assign(state, { enabled: true, stopRequested: false, targetCount: 1,
    settings: { websiteUrl: 'https://fixture.invalid/new' } });
  context.queueAutomaticRefill();
  const newResult = jobs.shift()();
  assert.equal(launches.length, 2);
  const newOwner = state.refillJob;
  state.message = 'new run';
  launches[0].resolve({ warnings: ['old warning'] });
  await oldResult;
  assert.equal(state.refillJob, newOwner);
  assert.equal(state.isRefilling, true);
  assert.equal(state.queued, true);
  assert.equal(state.message, 'new run');
  launches[1].resolve({ warnings: [] });
  await newResult;
  assert.equal(state.refillJob, null);
  assert.equal(state.isRefilling, false);
});

test('job bị Stop trước khi dequeued hoặc giữa delay không mở lại browser', async () => {
  for (const started of [false, true]) {
    const { context, state, jobs, delayed, launches } = refillFixture();
    context.queueAutomaticRefill(1000);
    const oldJob = jobs.shift();
    const oldResult = started ? oldJob() : null;
    context.invalidateRefillJobs();
    state.settings = { websiteUrl: 'https://fixture.invalid/new' };
    context.queueAutomaticRefill();
    const newOwner = state.refillJob;
    if (started) { delayed.shift()(); await oldResult; } else await oldJob();
    assert.equal(launches.length, 0);
    assert.equal(state.refillJob, newOwner);
    assert.equal(state.queued, true);
  }
});

test('sau delay phải đếm lại browser sống để không bù dư slot', async () => {
  const { context, state, jobs, delayed, launches, browsers } = refillFixture();
  context.queueAutomaticRefill(1000);
  const result = jobs.shift()();
  browsers.push({});
  delayed.shift()();
  await result;
  assert.equal(launches.length, 0);
  assert.equal(state.queued, false);
});

/**
 * Check sequential mode resets Stop while retaining a bounded requested target.
 * @param {void} None.
 * @return {Promise<void>} Resolves after the sequential route assertions pass.
 * @throws {AssertionError} When sequential state or count bounds differ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function verifySequentialRequestedCountBounds() {
  for (const requestedCount of [1, 4, 30]) {
    const { context, state, jobs } = refillFixture();
    Object.assign(state, { stopRequested: true, enabled: false, isRefilling: true });
    context.applyRunMode = () => {};
    context.readRequestBody = async () => JSON.stringify({ enabled: true, settings: {
      websiteUrl: 'https://fixture.invalid/1', websiteUrl2: 'https://fixture.invalid/2', requestedCount, multiTab: false,
    } });
    context.respondWithJson = () => {};
    load(context, 'src/http/routes/auto/post-refill-sequential.mjs');
    await context.handlePostAutoRefillSequential({ method: 'POST', url: '/auto-refill/sequential' }, {});
    assert.equal(state.stopRequested, false);
    assert.equal(state.isRefilling, false);
    assert.equal(state.targetCount, requestedCount);
    assert.equal(state.settings.multiTab, false);
    assert.equal(jobs.length, 1);
    state.noSlotRefill = true;
    await context.handlePostAutoRefillSequential({ method: 'POST', url: '/auto-refill/sequential' }, {});
    assert.equal(state.noSlotRefill, true);
    assert.equal(jobs.length, 1);
  }
  const { context, state } = refillFixture();
  context.applyRunMode = () => {};
  context.readRequestBody = async () => JSON.stringify({ enabled: true, settings: {
    websiteUrl: 'https://fixture.invalid/1', requestedCount: '31',
  } });
  context.respondWithJson = () => {};
  load(context, 'src/http/routes/auto/post-refill-sequential.mjs');
  await assert.rejects(
    () => context.handlePostAutoRefillSequential({ method: 'POST', url: '/auto-refill/sequential' }, {}),
    /Chỉ được mở tối đa 30/
  );
  assert.equal(state.targetCount, 1);
}
test('Stop rồi Sequential xóa cờ dừng, tôn trọng số luồng và Không bù slot', verifySequentialRequestedCountBounds);

test('cờ Fonts/API Fake IP được giữ nguyên từ Start sang cấu hình tự bù', async () => {
  const state = {}, launched = [];
  const context = vm.createContext({ autoRefill: state, maxAliveBrowsers: 30, countLiveBrowsers: () => 1,
    applyRunMode() {}, writeFile: async () => {}, lastLaunchSettingsPath: '/unused',
    saveAutoRefillSettings: async () => {}, launchRequestedBrowsers: async body => { launched.push(JSON.parse(body)); return {}; },
  });
  load(context, 'src/refill/actions/invalidate-refill-jobs.mjs');
  load(context, 'src/browser/actions/launch-user-requested-browsers.mjs');
  await context.launchUserRequestedBrowsers(JSON.stringify({ browserMode: 'Chrome', requestedCount: 1,
    antiFpFonts: true, antiFpApiFakeIP: true, runMode: 'manual' }));
  assert.equal(launched[0].antiFpFonts, true);
  assert.equal(state.settings.antiFpFonts, true);
  assert.equal(state.settings.antiFpApiFakeIP, true);
  assert.equal(state.settings.runMode, 'manual');
  assert.equal(state.sequential, false);
});

test('offer save/read giữ các lựa chọn true/false và preset cũ vẫn đọc được', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'autoleadpc-offer-run-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  let response;
  const options = { runMode: 'manual', runInApp: false, multiTab: false, CheckDuplicate: false, dataSaver: false,
    HideUntilLead: true, HideUntilTarget: false, enableLeadCheck: true, stopAutofillOnLead: true,
    enableChoiceDelay: true, choiceDelay: 8 };
  const body = { ...options, NameOffer: 'Fixture', LinkOffer: 'https://fixture.invalid/form' };
  const context = vm.createContext({ ...fs, join: path.join, getAutoLeadPCDir: () => temporary,
    readRequestBody: async () => JSON.stringify(body), normalizeOfferRunOptions,
    loadOfferStrategies: async () => {}, respondWithJson: (res, status, value) => { response = { status, value }; },
  });
  load(context, 'src/http/routes/pc/post-offer-save.mjs');
  load(context, 'src/http/routes/pc/get-offer-read.mjs');
  await context.handlePostPcOfferSave({ method: 'POST', url: '/pc/offer/save' }, {});
  assert.equal(response.status, 200);
  for (const [key, value] of Object.entries(options)) assert.equal(response.value.savedItem[key], value, key);
  await context.handleGetPcOfferRead({ method: 'GET', url: '/pc/offer/read' }, {});
  for (const [key, value] of Object.entries(options)) assert.equal(response.value[key], value, key);
  assert.equal(response.value.savedList[0].runMode, 'manual');
  fs.writeFileSync(path.join(temporary, 'Config/Offer/Offer.ini'), '[Data]\nNameOffer=Legacy\nLinkOffer=https://fixture.invalid/old\n');
  await context.handleGetPcOfferRead({ method: 'GET', url: '/pc/offer/read' }, {});
  assert.equal(response.value.NameOffer, 'Legacy');
  assert.equal(response.value.LinkOffer, 'https://fixture.invalid/old');
});

/**
 * Dựng dashboard với DOM/cache riêng để kiểm tra preset và payload ở cả hai đường Start.
 * @return {object} VM, các element, localStorage và request đã gửi.
 * @throws {Error} Khi một fixture UI function không thể nạp.
 * @author ductv <ductv@getflycrm.com> @since 2026-11-18
 */
function dashboardFixture() {
  const elements = new Map(), storage = new Map(), requests = [];
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { checked: false, value: '', style: {}, disabled: false,
      textContent: '', addEventListener() {}, classList: { toggle() {} } });
    return elements.get(id);
  };
  getElement('cbxRunInApp').checked = true;
  getElement('nudThread').value = '1';
  getElement('txtLinkOffer').value = 'https://fixture.invalid/offer';
  getElement('cbxAuto').value = 'auto';
  const context = vm.createContext({ document: { getElementById: getElement }, currentSavedOffers: [],
    cachedSessions: [], localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    syncOptionPills() {}, toggleExtraOfferLinks() {}, applyOfferMethods() {}, renderSavedOffersDropdown() {},
    setTimeout() {}, switchTab() {}, fetchRunningState() {}, showWinAlert: message => assert.fail(message),
    saveOfferConfig: async () => ({ success: true }),
    api: async (url, options) => { requests.push({ url, body: options?.body ? JSON.parse(options.body) : null }); return {}; },
  });
  context.window = context;
  for (const name of ['get-lead-check-settings', 'select-lead-check-interval', 'toggle-stop-autofill-on-lead',
    'toggle-choice-delay', 'sync-gologin-setting', 'sync-window-display-mode', 'apply-offer-run-options',
    'load-offer-config', 'handle-select-saved-offer', 'handle-start']) load(context, `ui/desktop/functions/${name}.js`);
  return { context, getElement, storage, requests };
}

/**
 * Check Desktop count normalization and round-trip persistence for exact decimal values.
 * @param {void} None.
 * @return {Promise<void>} Resolves after local and backend settings reload checks pass.
 * @throws {AssertionError} When the count is corrupted or persisted beyond the UI hard bound.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function verifyDesktopCountPersistence() {
  const { context, getElement, storage, requests } = dashboardFixture();
  const field = getElement('nudThread');
  let onChange;
  field.addEventListener = (event, listener) => { if (event === 'change') onChange = listener; };
  await context.loadOfferConfig();
  const largeCount = '123456789012345678901234567890';
  for (const [typed, expected] of [['31', '31'], ['00050', '50'], ['0', '1'], ['-2', '1'], ['1.5', '1'], ['1e2', '1'], ['2x', '1'], ['', '1'], [largeCount, '256']]) {
    field.value = typed;
    onChange();
    assert.equal(field.value, expected);
    assert.equal(storage.get('autoleadpc_thread_count'), expected);
  }
  field.value = '31';
  onChange();
  load(context, 'ui/desktop/functions/save-offer-config.js');
  await context.saveOfferConfig(true);
  const saved = requests.find(request => request.url === '/pc/offer/save').body;
  assert.equal(saved.Thread, '31');
  field.value = '';
  await context.loadOfferConfig();
  assert.equal(field.value, '31');
  storage.clear();
  context.api = async () => saved;
  field.value = '';
  await context.loadOfferConfig();
  assert.equal(field.value, '31');
}
test('Số luồng Desktop giữ số thập phân an toàn và chuẩn hóa dữ liệu lỗi khi lưu/tải', verifyDesktopCountPersistence);

test('Start thường và Sequential cùng truyền multiTab=false và các lựa chọn chờ lead', async () => {
  for (const mode of ['auto', 'sequential']) {
    const { context, getElement, requests } = dashboardFixture();
    getElement('cbxAuto').value = mode;
    getElement('cbxMultiTab').checked = false;
    context.toggleStopAutofillOnLead(true);
    await context.handleStart();
    const request = requests.find(request => request.url === (mode === 'auto' ? '/launch' : '/auto-refill/sequential'));
    const settings = request.body.settings ?? request.body;
    assert.equal(settings.multiTab, false);
    assert.equal(settings.enableLeadCheck, true);
    assert.equal(settings.stopAutofillOnLead, true);
  }
});

/**
 * Check Desktop Start sends a decimal count as text and a bounded integer alias.
 * @param {void} None.
 * @return {Promise<void>} Resolves after the mocked launch request is asserted.
 * @throws {AssertionError} When the payload changes the requested count.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function verifyDesktopStartCountPayload() {
  const { context, getElement, requests } = dashboardFixture();
  getElement('nudThread').value = '100';
  await context.handleStart();
  const launch = requests.find(request => request.url === '/launch');
  assert.equal(launch.body.requestedCount, '100');
  assert.equal(launch.body.concurrency, 100);
}
test('Desktop Start gửi số luồng thập phân an toàn chính xác xuống backend', verifyDesktopStartCountPayload);

/**
 * Check Mac sequential Start sends the exact bounded count in both request fields.
 * @param {void} None.
 * @return {Promise<void>} Resolves after two mocked sequential requests are asserted.
 * @throws {AssertionError} When Mac omits or numerically corrupts the count.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function verifyMacSequentialCountPayload() {
  let listener;
  let requestedCount = '12';
  const button = { disabled: false, addEventListener: (event, callback) => { listener = callback; } };
  const requests = [];
  const context = vm.createContext({
    document: { querySelector: () => button },
    buildRequestBody: () => ({ requestedCount }),
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { json: async () => ({ message: 'ok' }) };
    },
    autoRefillStatus: { textContent: '' }
  });
  load(context, 'ui/mac/setup/sequential-start-btn-click.js');
  await listener();
  assert.equal(requests[0].body.settings.requestedCount, '12');
  assert.equal(requests[0].body.settings.concurrency, '12');
  requestedCount = '123';
  await listener();
  assert.equal(requests[1].body.settings.requestedCount, '123');
  assert.equal(requests[1].body.settings.concurrency, '123');
}
test('Mac Sequential gửi requestedCount/concurrency từ ô số luồng mà không mất chính xác', verifyMacSequentialCountPayload);

/**
 * Build an offline Mini DOM and intercept every fetch used by count load/save/Start.
 * @param {void} None.
 * @return {object} VM context, elements, and captured request bodies.
 * @throws {Error} When a requested source file cannot be read or evaluated.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function miniCountFixture() {
  const elements = new Map(), requests = [];
  let createdElement = 0;
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, {
      checked: false, value: '', style: {}, disabled: false, open: false, innerHTML: '',
      listeners: {}, textContent: '', classList: { toggle() {} },
      addEventListener(event, listener) { this.listeners[event] = listener; },
      appendChild() {}
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: getElement, querySelectorAll: () => [], createElement: () => getElement(`created-${++createdElement}`) },
    activeSessions: [], currentBrowserMode: 'Chrome',
    localStorage: { getItem: () => null, setItem() {} },
    syncOptionPills() {},
    showToast() {}, alert: message => assert.fail(message), pollState: async () => {},
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ url, body });
      const value = url === '/launch-settings'
        ? { settings: { requestedCount: '31', concurrency: 31 } }
        : url === '/pc/offer/read'
          ? { savedList: [{ NameOffer: 'Fixture', LinkOffer: 'https://fixture.invalid/offer', Thread: '31' }] }
          : url === '/pc/offer/save'
            ? { success: true, savedItem: body, savedList: [] }
            : {};
      return { ok: true, json: async () => value };
    }
  });
  context.window = context;
  context.inputThreadCount = getElement('inputThreadCount');
  for (const file of [
    'ui/mini/functions/load-last-launch-settings.js',
    'ui/mini/functions/load-saved-offers.js',
    'ui/mini/features/run/run-tools.js',
    'ui/mini/setup/btn-start-launch-click.js'
  ]) load(context, file);
  getElement('inputWebsiteUrl').value = 'https://fixture.invalid/offer';
  return { context, getElement, requests };
}

/**
 * Check Mini settings and saved-offer load, offer save, and Start share the exact bounded count.
 * @param {void} None.
 * @return {Promise<void>} Resolves after all mocked Mini count paths agree.
 * @throws {AssertionError} When count text is lost, NaN is sent, or a malformed count is persisted.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function verifyMiniCountRoundTrip() {
  const { context, getElement, requests } = miniCountFixture();
  await context.loadLastLaunchSettings();
  assert.equal(context.inputThreadCount.value, '31');
  context.inputThreadCount.value = '123456789012345678901234567890';
  context.inputThreadCount.listeners.input({ currentTarget: context.inputThreadCount });
  assert.equal(context.inputThreadCount.value, '256');
  await context.loadSavedOffers();
  getElement('selSavedOffer').value = '0';
  getElement('selSavedOffer').listeners.change();
  assert.equal(context.inputThreadCount.value, '31');
  const payload = context.miniRunBuildOfferPayload();
  assert.equal(payload.Thread, '31');
  await context.miniRunSaveOffer(true);
  assert.equal(requests.find(request => request.url === '/pc/offer/save').body.Thread, '31');
  await context.miniRunStart();
  const start = requests.find(request => request.url === '/launch');
  assert.equal(start.body.requestedCount, '31');
  assert.equal(start.body.concurrency, 31);
  assert.ok(Number.isFinite(start.body.concurrency));
}
test('Mini load/save/saved-offer/Start giữ cùng requestedCount hữu hạn', verifyMiniCountRoundTrip);

test('nạp cấu hình trên trình duyệt mới và đổi preset giữ đúng mọi checkbox phụ thuộc', async () => {
  const { context, getElement, storage } = dashboardFixture();
  const first = { id: 'first', NameOffer: 'First', LinkOffer: 'https://fixture.invalid/first', Thread: 4, LimitRun: 10,
    runMode: 'manual', runInApp: false, HideUntilLead: true, HideUntilTarget: false, multiTab: false,
    CheckDuplicate: false, dataSaver: false, enableLeadCheck: true, stopAutofillOnLead: true,
    enableChoiceDelay: true, choiceDelay: 8, offerSolver: '2615' };
  const second = { id: 'second', NameOffer: 'Second', LinkOffer: 'https://fixture.invalid/second', Thread: 1, LimitRun: 0,
    runMode: 'auto', runInApp: true, HideUntilLead: false, HideUntilTarget: false, multiTab: true,
    CheckDuplicate: true, dataSaver: true, enableLeadCheck: false, stopAutofillOnLead: false,
    enableChoiceDelay: false, choiceDelay: 2, offerSolver: 'generic' };
  context.api = async () => ({ ...first, savedList: [first, second] });
  await context.loadOfferConfig();
  assert.equal(getElement('cbxAuto').value, 'manual');
  assert.equal(getElement('cbxCheckLead').checked, true);
  assert.equal(getElement('cbxStopAutofillOnLead').checked, true);
  assert.equal(getElement('cbxHideUntilLead').checked, true);
  assert.equal(getElement('cbxRunInApp').checked, false);
  assert.equal(getElement('cbxMultiTab').checked, false);
  assert.equal(getElement('nudChoiceDelay').value, '8');
  getElement('cbbSavedOffers').value = 'second';
  context.handleSelectSavedOffer();
  assert.equal(getElement('cbxAuto').value, 'auto');
  for (const id of ['cbxCheckLead', 'cbxStopAutofillOnLead', 'cbxHideUntilLead', 'cbxChoiceDelay', 'cbxChoiceDelayPill']) {
    assert.equal(getElement(id).checked, false, id);
  }
  for (const id of ['cbxRunInApp', 'cbxMultiTab', 'cbxDataSaver', 'cbxCheckDuplicateIP']) assert.equal(getElement(id).checked, true, id);
  assert.equal(getElement('nudThread').value, '1');
  assert.equal(getElement('nudLimitRun').value, '0');
  assert.equal(storage.get('autoleadpc_run_mode'), 'auto');
  // Backend vẫn lưu First: reload phải khôi phục lựa chọn của First cùng với link First.
  await context.loadOfferConfig();
  assert.equal(getElement('txtLinkOffer').value, first.LinkOffer);
  assert.equal(getElement('cbxAuto').value, 'manual');
  assert.equal(getElement('cbxMultiTab').checked, false);
  // Nạp preset yêu cầu Desktop khi đang chọn Obscura vẫn giữ engine và preview đúng.
  context.syncObscuraSetting(true);
  getElement('cbbSavedOffers').value = 'first';
  context.handleSelectSavedOffer();
  assert.equal(getElement('cbxObscura').checked, true);
  assert.equal(getElement('cbxRunInApp').checked, true);
  assert.equal(getElement('cbxHideUntilLead').checked, false);
});

test('giá trị tắt chờ lead luôn thắng preset mâu thuẫn; false không bị đổi thành mặc định true', () => {
  const normalized = normalizeOfferRunOptions({ enableLeadCheck: false, HideUntilLead: true, stopAutofillOnLead: true,
    runInApp: false, multiTab: false, dataSaver: false, CheckDuplicate: false });
  assert.equal(normalized.HideUntilLead, false);
  assert.equal(normalized.stopAutofillOnLead, false);
  for (const key of ['runInApp', 'multiTab', 'dataSaver', 'CheckDuplicate']) assert.equal(normalized[key], false);
});


test('Sequential báo đúng lỗi khởi động thay vì hiển thị đã bật khi backend từ chối', async () => {
  const { context, getElement } = dashboardFixture();
  const alerts = [];
  getElement('cbxAuto').value = 'sequential';
  context.showWinAlert = message => alerts.push(message);
  context.api = async () => ({ error: 'App đang dừng trình duyệt' });
  await context.handleStart();
  assert.ok(alerts.some(message => message.includes('đang dừng')));
  assert.match(getElement('lbStatus').textContent, /Launch error/);
});
