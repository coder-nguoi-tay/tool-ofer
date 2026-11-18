import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
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
 * Tạo hàng đợi bù dùng deferred promises để tái hiện Stop/Start trong khi còn I/O.
 * @return {object} Context và các lượt mở có thể chủ động hoàn tất.
 * @author ductv <ductv@getflycrm.com> @since 2026-11-18
 */
function refillFixture() {
  const jobs = [], delayed = [], launches = [], browsers = [];
  const state = { enabled: true, stopRequested: false, noSlotRefill: false, targetCount: 1,
    queued: false, settings: { websiteUrl: 'https://fixture.invalid/old' } };
  const context = vm.createContext({ autoRefill: state, activeBrowsers: new Set(), maxAliveBrowsers: 30,
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

test('Stop rồi Sequential xóa cờ dừng, tôn trọng số luồng và Không bù slot', async () => {
  for (const requestedCount of [1, 4, 40]) {
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
    assert.equal(state.targetCount, Math.min(requestedCount, 30));
    assert.equal(state.settings.multiTab, false);
    assert.equal(jobs.length, 1);
    state.noSlotRefill = true;
    await context.handlePostAutoRefillSequential({ method: 'POST', url: '/auto-refill/sequential' }, {});
    assert.equal(state.noSlotRefill, true);
    assert.equal(jobs.length, 1);
  }
});

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
