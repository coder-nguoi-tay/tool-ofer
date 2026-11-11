import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { closeChromeWhenLastTabCloses } from '../src/browser/actions/close-chrome-when-last-tab-closes.mjs';
import { prepareManualBrowserClose } from '../src/browser/actions/prepare-manual-browser-close.mjs';
import { attachBrowserCloseHandler } from '../src/browser/actions/attach-browser-close-handler.mjs';
import { handlePostBrowserClose } from '../src/http/routes/browser/post-close.mjs';

test('luồng không check lead giữ mục tiêu và bù khi bấm X; Dừng vẫn thắng', async t => {
  const previous = { ...autoRefill };
  t.after(() => Object.assign(autoRefill, previous));
  for (const managed of [false, true]) await t.test(managed ? 'AdsPower X' : 'Chrome X', async () => {
    Object.assign(autoRefill, { enabled: true, stopRequested: false, settings: null, targetCount: 3 });
    let onClose, closeCalls = 0;
    const logs = [];
    const page = { isClosed: () => true, url: () => 'https://offer.test', on: (_, handler) => { onClose = handler; } };
    const session = { slot: 2, enableLeadCheck: false, isManagedProfile: managed, suppressAutoRefill: false, addBrowserLog: entry => logs.push(entry), browser: {
      pages: () => [page], on() {}, close: async () => { closeCalls++; },
    } };
    closeChromeWhenLastTabCloses(session);
    await onClose();
    assert.equal(session.suppressAutoRefill, false);
    assert.equal(session.isClosed, true);
    assert.equal(autoRefill.targetCount, 3);
    assert.equal(closeCalls, 1);
    assert.equal(logs[0].type, 'manual_browser_closed_refill');
  });
  await t.test('Dừng hoặc tự bù tắt không cho mở lại', () => {
    for (const state of [{ enabled: false, stopRequested: false }, { enabled: true, stopRequested: true }]) {
      Object.assign(autoRefill, state, { targetCount: 3, settings: null });
      const session = { enableLeadCheck: false, suppressAutoRefill: false };
      assert.equal(prepareManualBrowserClose(session), false);
      assert.equal(session.suppressAutoRefill, true);
      assert.equal(autoRefill.targetCount, 3);
    }
    Object.assign(autoRefill, { enabled: true, stopRequested: false });
    const closingSession = { enableLeadCheck: false, suppressAutoRefill: false };
    assert.equal(prepareManualBrowserClose(closingSession), true);
    autoRefill.stopRequested = true;
    assert.equal(prepareManualBrowserClose(closingSession), false);
  });
  await t.test('đóng chủ động của luồng check lead giảm mục tiêu đúng một lần', () => {
    Object.assign(autoRefill, { enabled: true, stopRequested: false, targetCount: 3, settings: null });
    const session = { enableLeadCheck: true, suppressAutoRefill: false };
    assert.equal(prepareManualBrowserClose(session), false);
    assert.equal(prepareManualBrowserClose(session), false);
    assert.equal(autoRefill.targetCount, 2);
  });
});

test('nút X trong bảng không giảm target của luồng không check lead', async t => {
  const previous = { ...autoRefill };
  let closeCalls = 0, response;
  const session = { slot: 9898, enableLeadCheck: false, suppressAutoRefill: false, browser: { close: async () => { closeCalls++; } } };
  activeBrowsers.add(session);
  Object.assign(autoRefill, { enabled: true, stopRequested: false, targetCount: 3, settings: null });
  t.after(() => { activeBrowsers.delete(session); Object.assign(autoRefill, previous); });
  const request = { method: 'POST', url: '/browser/close/9898' };
  const reply = { writeHead() {}, end(body) { response = JSON.parse(body); } };
  assert.equal(await handlePostBrowserClose(request, reply), true);
  assert.equal(response.ok, true);
  assert.equal(session.suppressAutoRefill, false);
  assert.equal(autoRefill.targetCount, 3);
  assert.equal(closeCalls, 1);
});

test('crash/disconnect và context close trùng chỉ chạy cleanup một lần cho Chrome và AdsPower', () => {
  for (const managed of [false, true]) {
    const context = new EventEmitter(), connection = new EventEmitter();
    context.browser = () => connection;
    const session = { browser: context, ...(managed ? { _cdpBrowser: connection } : {}) };
    let callbacks = 0;
    attachBrowserCloseHandler(session, () => { callbacks++; });
    connection.emit('disconnected');
    context.emit('close');
    connection.emit('disconnected');
    assert.equal(callbacks, 1);
  }
});

test('queue thật bù đủ slot bằng đúng launcher, không reset target hoặc cấu hình check lead', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'AutoLeadPC-refill-routing-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Chỉ thay module dependency trong bản sao tạm; thân queue/dispatch lấy nguyên source.
  // Launcher giả không mở browser, truy cập AdsPower, đọc proxy thật hoặc gọi mạng.
  for (const [source, name] of [
    ['src/refill/actions/queue-automatic-refill.mjs', 'queue.mjs'],
    ['src/refill/actions/launch-refill-browsers.mjs', 'launcher.mjs'],
  ]) {
    const code = await readFile(new URL('../' + source, import.meta.url), 'utf8');
    await writeFile(join(directory, name), code.replace(/from '[^']+'/g, "from './fixture.mjs'"));
  }
  await writeFile(join(directory, 'fixture.mjs'), `
export { launchRefillBrowsers } from './launcher.mjs';
export { pickRefillOfferRoles } from '${new URL('../src/refill/actions/pick-refill-offer-roles.mjs', import.meta.url).href}';
export const offerStrategyState = new Map();
export const activeBrowsers = new Set();
export const autoRefill = { enabled:true, stopRequested:false, queued:false, targetCount:3, sequential:false };
export const remoteAgents = new Map();
export const maxAliveBrowsers = 20;
export const normalizeUrl = value => value;
export const pruneStaleAgents = () => {};
export const dispatchOneTaskToAgent = () => false;
export let lastJob = Promise.resolve();
export function enqueueExclusively(job) { lastJob = lastJob.then(job); return lastJob; }
export const calls = [];
function launch(body, engine, options) {
 const request = JSON.parse(body);
 calls.push({ engine, request, options });
 for (let i=0;i<request.requestedCount;i++) activeBrowsers.add({ isClosed:false, offerNumber:1 });
 return Promise.resolve({ results:[], warnings:[] });
}
export function launchRequestedBrowsers(body, options) { return launch(body,'Chrome',options); }
export function launchAdsPowerBrowsers(body, automatic, roles) { return launch(body,'AdsPower',{ automatic, roles }); }
`);
  const fixture = await import(pathToFileURL(join(directory, 'fixture.mjs')).href);
  const { queueAutomaticRefill } = await import(pathToFileURL(join(directory, 'queue.mjs')).href);
  for (const mode of ['Chrome', 'AdsPower']) {
    fixture.activeBrowsers.clear();
    fixture.activeBrowsers.add({ isClosed: false, offerNumber: 1 });
    fixture.calls.length = 0;
    const settings = { browserMode: mode, websiteUrl: 'https://offer.test/a', enableLeadCheck: false };
    Object.assign(fixture.autoRefill, { settings, queued: false });
    queueAutomaticRefill();
    await fixture.lastJob;
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].engine, mode);
    assert.equal(fixture.calls[0].request.requestedCount, 2);
    assert.equal(fixture.calls[0].request.enableLeadCheck, false);
    assert.equal(fixture.activeBrowsers.size, 3);
    assert.equal(fixture.autoRefill.targetCount, 3);
    assert.equal(fixture.autoRefill.settings, settings);
    if (mode === 'AdsPower') assert.equal(fixture.calls[0].options.automatic, true);
  }
});
