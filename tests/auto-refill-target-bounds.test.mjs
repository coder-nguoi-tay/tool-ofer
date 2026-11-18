import test from 'node:test';
import assert from 'node:assert/strict';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';
import { countLiveBrowsers, getLiveBrowsers } from '../src/browser/count-live-browsers.mjs';
import { getAutoRefillStatus } from '../src/refill/actions/get-auto-refill-status.mjs';
import { launchUserRequestedBrowsers } from '../src/browser/actions/launch-user-requested-browsers.mjs';
import { launchObscuraBrowsers } from '../src/browser/actions/launch-obscura-browsers.mjs';

test('countLiveBrowsers và getLiveBrowsers chỉ đếm các session còn sống thật', t => {
  const previousBrowsers = new Set(activeBrowsers);
  t.after(() => {
    activeBrowsers.clear();
    for (const b of previousBrowsers) activeBrowsers.add(b);
  });

  activeBrowsers.clear();

  // 1 session sống bình thường
  const liveSession = {
    isClosed: false,
    browser: { isClosed: () => false, isConnected: () => true },
  };

  // 1 session đã đóng (isClosed)
  const closedSession = {
    isClosed: true,
    browser: { isClosed: () => false, isConnected: () => true },
  };

  // 1 session browser.isClosed() = true
  const deadBrowserSession = {
    isClosed: false,
    browser: { isClosed: () => true, isConnected: () => true },
  };

  // 1 session browser.isConnected() = false
  const disconnectedSession = {
    isClosed: false,
    browser: { isClosed: () => false, isConnected: () => false },
  };

  // 1 session Obscura còn sống (process alive)
  const obscuraLiveSession = {
    isClosed: false,
    isObscuraProcessAlive: () => true,
    browser: { isClosed: () => false, isConnected: () => false },
  };

  // 1 session Obscura đã bị đánh dấu đóng
  const obscuraClosedSession = {
    isClosed: true,
    isObscuraProcessAlive: () => true,
  };

  activeBrowsers.add(liveSession);
  activeBrowsers.add(closedSession);
  activeBrowsers.add(deadBrowserSession);
  activeBrowsers.add(disconnectedSession);
  activeBrowsers.add(obscuraLiveSession);
  activeBrowsers.add(obscuraClosedSession);

  assert.equal(activeBrowsers.size, 6);
  assert.equal(countLiveBrowsers(), 2);

  const liveList = getLiveBrowsers();
  assert.equal(liveList.length, 2);
  assert.ok(liveList.includes(liveSession));
  assert.ok(liveList.includes(obscuraLiveSession));
});

test('getAutoRefillStatus dùng countLiveBrowsers thay vì activeBrowsers.size', t => {
  const previousBrowsers = new Set(activeBrowsers);
  t.after(() => {
    activeBrowsers.clear();
    for (const b of previousBrowsers) activeBrowsers.add(b);
  });

  activeBrowsers.clear();
  // 1 session sống, 2 session chết
  activeBrowsers.add({ isClosed: false, browser: { isClosed: () => false, isConnected: () => true } });
  activeBrowsers.add({ isClosed: true });
  activeBrowsers.add({ isClosed: false, browser: { isConnected: () => false } });

  const status = getAutoRefillStatus();
  assert.equal(status.activeCount, 1);
});

test('Start 1 slot với targetCount cũ lớn phải reset targetCount về 1, không bị phình to', async t => {
  const prevAutoRefill = { ...autoRefill };
  const prevBrowsers = new Set(activeBrowsers);
  t.after(() => {
    Object.assign(autoRefill, prevAutoRefill);
    activeBrowsers.clear();
    for (const b of prevBrowsers) activeBrowsers.add(b);
  });

  activeBrowsers.clear();
  // Giả lập phiên trước targetCount từng là 10
  autoRefill.targetCount = 10;
  autoRefill.enabled = true;
  autoRefill.stopRequested = false;

  const body = {
    requestedCount: 1,
    concurrency: 1,
    browserMode: 'Obscura',
    useObscura: true,
    websiteUrl: 'https://example.com',
  };

  // Target count của Obscura khi Start mới không được kế thừa số 10 cũ
  autoRefill.targetCount = 10;
  await launchObscuraBrowsers(JSON.stringify(body)).catch(() => {});

  assert.equal(autoRefill.targetCount, 1, 'targetCount phải được đặt là 1, không được giữ lại số 10');
});

test('launchUserRequestedBrowsers đặt đúng targetCount = requestedCount khi Start mới', async t => {
  const prevAutoRefill = { ...autoRefill };
  const prevBrowsers = new Set(activeBrowsers);
  t.after(() => {
    autoRefill.stopRequested = true;
    autoRefill.enabled = false;
    autoRefill.queued = false;
    autoRefill.isRefilling = false;
    activeBrowsers.clear();
    for (const b of prevBrowsers) activeBrowsers.add(b);
  });

  activeBrowsers.clear();
  // Giả lập phiên trước targetCount là 8
  autoRefill.targetCount = 8;
  autoRefill.enabled = true;

  const body = {
    requestedCount: 1,
    concurrency: 1,
    browserMode: 'Chrome',
    websiteUrl: 'https://example.com',
  };

  await launchUserRequestedBrowsers(JSON.stringify(body)).catch(() => {});
  assert.equal(autoRefill.targetCount, 1, 'launchUserRequestedBrowsers phải đặt targetCount = 1');
});

test('queueAutomaticRefill với nhiều offer URLs và targetCount = 1 không bị ép seqTarget = offerCount', async t => {
  const prevAutoRefill = { ...autoRefill };
  const prevBrowsers = new Set(activeBrowsers);
  t.after(() => {
    Object.assign(autoRefill, prevAutoRefill);
    activeBrowsers.clear();
    for (const b of prevBrowsers) activeBrowsers.add(b);
  });

  activeBrowsers.clear();
  autoRefill.enabled = true;
  autoRefill.stopRequested = false;
  autoRefill.noSlotRefill = false;
  autoRefill.sequential = true;
  autoRefill.queued = false;
  autoRefill.isRefilling = false;
  autoRefill.pendingRefillRequest = false;
  autoRefill.targetCount = 1;
  autoRefill.settings = {
    browserMode: 'Chrome',
    offerUrls: Array.from({ length: 20 }, (_, i) => `https://offer.test/${i + 1}`),
    concurrency: 1,
    requestedCount: 1,
  };

  // 1 session đang sống
  activeBrowsers.add({ isClosed: false, browser: { isClosed: () => false, isConnected: () => true } });

  const { applicationState } = await import('../src/runtime/application-state.mjs');
  applicationState.exclusiveQueue = Promise.resolve();

  const { queueAutomaticRefill } = await import('../src/refill/actions/queue-automatic-refill.mjs');
  queueAutomaticRefill();
  await new Promise(r => setTimeout(r, 100));
  // Đã có 1 browser sống = targetCount, sau khi microtask kết thúc không được bù thêm slot nào
  assert.equal(autoRefill.isRefilling, false);
  assert.equal(autoRefill.queued, false);
});
