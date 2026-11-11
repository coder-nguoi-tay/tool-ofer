import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { attachScreencastSession, createViewerHub, releaseScreencast } from "../app.mjs";

/**
 * CDP giả: captureScreenshot treo vĩnh viễn như khi cửa sổ Chrome đang thu nhỏ (đã đo thực tế).
 */
function fakeCdp(windowState = 'normal') {
  const cdp = new EventEmitter();
  cdp.calls = [];
  cdp.send = (method, params) => {
    cdp.calls.push({ method, params });
    if (method === 'Browser.getWindowForTarget') return Promise.resolve({ windowId: 1, bounds: { windowState } });
    if (method === 'Page.captureScreenshot') return new Promise(() => {});
    return Promise.resolve({});
  };
  cdp.detach = async () => {};
  return cdp;
}

function fakeResponse(writeResult = true) {
  const res = new EventEmitter();
  res.writes = [];
  res.writableEnded = false;
  res.destroyed = false;
  res.writableNeedDrain = false;
  res.write = (chunk) => { res.writes.push(chunk); return writeResult; };
  return res;
}

const fakePage = { viewportSize: () => ({ width: 1280, height: 800 }), isClosed: () => false, on() {} };
const acks = (cdp) => cdp.calls.filter((c) => c.method === 'Page.screencastFrameAck').length;
const stop = (scObj) => { scObj.cleaned = true; clearInterval(scObj.keepaliveTimer); };

test('giảm tải stream: lấy một trong hai frame và trang tĩnh chỉ chụp bù sau 1,5 giây', async t => {
  let now = 1000;
  let pump;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setInterval', (callback, delay) => {
    assert.equal(delay, 500);
    pump = callback;
    return 1;
  });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const cdp = fakeCdp();
  cdp.send = async (method, params) => {
    cdp.calls.push({ method, params });
    if (method === 'Browser.getWindowForTarget') return { windowId: 1, bounds: { windowState: 'normal' } };
    if (method === 'Page.captureScreenshot') return { data: 'IMAGE' };
    return {};
  };
  const stream = { sseResponse: fakeResponse() };
  await attachScreencastSession(stream, cdp, fakePage);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cdp.calls.find(call => call.method === 'Page.startScreencast').params.everyNthFrame, 2);
  assert.equal(cdp.calls.filter(call => call.method === 'Page.captureScreenshot').length, 1);
  now = 2499;
  await pump();
  assert.equal(cdp.calls.filter(call => call.method === 'Page.captureScreenshot').length, 1);
  now = 2500;
  await pump();
  assert.equal(cdp.calls.filter(call => call.method === 'Page.captureScreenshot').length, 2);
  stop(stream);
});

test('attachScreencastSession không bị treo khi captureScreenshot treo (cửa sổ thu nhỏ)', async () => {
  const cdp = fakeCdp();
  const scObj = { sseResponse: fakeResponse() };
  const result = await Promise.race([
    attachScreencastSession(scObj, cdp, fakePage, 1, null).then(() => 'done'),
    new Promise((resolve) => setTimeout(() => resolve('hung'), 500)),
  ]);
  assert.equal(result, 'done', 'attach phải xong ngay, không await frame ban đầu');
  assert.ok(cdp.calls.some((c) => c.method === 'Page.startScreencast'));
  assert.ok(scObj.keepaliveTimer, 'timer chụp bù phải được bật');
  stop(scObj);
});

test('chống nghẽn: chỉ ack frame khi socket người xem đã drain', async () => {
  const cdp = fakeCdp();
  const res = fakeResponse(false);
  const scObj = { sseResponse: res };
  await attachScreencastSession(scObj, cdp, fakePage, 2, null);

  cdp.emit('Page.screencastFrame', { data: 'AAA', sessionId: 7, metadata: {} });
  await new Promise((r) => setImmediate(r));
  assert.equal(res.writes.at(-1), 'data: AAA\n\n');
  assert.equal(acks(cdp), 0, 'socket đang nghẽn thì chưa được ack, để Chrome giãn nhịp frame');

  res.emit('drain');
  await new Promise((r) => setImmediate(r));
  assert.equal(acks(cdp), 1);
  stop(scObj);
});

test('socket thông thì ack ngay; kết nối đã dọn thì không ghi frame', async () => {
  const cdp = fakeCdp();
  const res = fakeResponse(true);
  const scObj = { sseResponse: res };
  await attachScreencastSession(scObj, cdp, fakePage, 3, null);

  cdp.emit('Page.screencastFrame', { data: 'BBB', sessionId: 1 });
  await new Promise((r) => setImmediate(r));
  assert.equal(acks(cdp), 1);

  stop(scObj);
  const before = res.writes.length;
  cdp.emit('Page.screencastFrame', { data: 'CCC', sessionId: 2 });
  await new Promise((r) => setImmediate(r));
  assert.equal(res.writes.length, before, 'slot đã đóng không được ghi thêm frame');
});

test('cửa sổ thu nhỏ: không gửi captureScreenshot (lệnh treo sẽ chặn screencast); cửa sổ thường vẫn chụp frame đầu', async () => {
  const flush = () => new Promise((r) => setTimeout(r, 20));
  const minimized = fakeCdp('minimized');
  const a = { sseResponse: fakeResponse() };
  await attachScreencastSession(a, minimized, fakePage, 4, null);
  await flush();
  assert.equal(minimized.calls.filter((c) => c.method === 'Page.captureScreenshot').length, 0);
  stop(a);

  const normal = fakeCdp('normal');
  const b = { sseResponse: fakeResponse() };
  await attachScreencastSession(b, normal, fakePage, 5, null);
  await flush();
  assert.equal(normal.calls.filter((c) => c.method === 'Page.captureScreenshot').length, 1);
  stop(b);
});

function makePage() {
  const page = new EventEmitter();
  page.closed = false;
  page.isClosed = () => page.closed;
  page.viewportSize = () => ({ width: 1280, height: 800 });
  return page;
}

function makeSession(pages) {
  const session = { isClosed: false, mainPage: pages[0] || null, created: [] };
  session.browser = {
    pages: () => pages.filter((p) => !p.isClosed()),
    newCDPSession: async () => { const c = fakeCdp(); session.created.push(c); return c; },
  };
  return session;
}

const tick = () => new Promise((r) => setTimeout(r, 20));

test('mục 2 - createViewerHub: nhiều người xem chung, người mới nhận ngay frame gần nhất', () => {
  const hub = createViewerHub();
  const a = fakeResponse();
  hub.add(a);
  assert.equal(hub.write('data: F1\n\n'), true);
  const b = fakeResponse();
  hub.add(b);
  assert.deepEqual(b.writes, ['data: F1\n\n'], 'người xem mới (vd Telegram mini) nhận ngay frame gần nhất');
  hub.write('data: F2\n\n');
  assert.equal(a.writes.at(-1), 'data: F2\n\n');
  assert.equal(b.writes.at(-1), 'data: F2\n\n');
  assert.equal(hub.size, 2);
});

test('mục 2 - createViewerHub: người xem chậm chỉ bị bỏ frame của riêng họ', () => {
  const hub = createViewerHub();
  const fast = fakeResponse();
  const slow = fakeResponse();
  slow.writableNeedDrain = true;
  hub.add(fast);
  hub.add(slow);
  assert.equal(hub.write('data: X\n\n'), true, 'còn người xem thông thì Chrome vẫn được ack ngay');
  assert.equal(fast.writes.at(-1), 'data: X\n\n');
  assert.equal(slow.writes.length, 0, 'người xem đang nghẽn không bị dồn thêm frame');
  hub.write(': ping\n\n');
  assert.equal(slow.writes.at(-1), ': ping\n\n', 'ping giữ kết nối vẫn gửi cho mọi người');

  fast.writableNeedDrain = true;
  assert.equal(hub.write('data: Y\n\n'), false, 'mọi người xem đều nghẽn → hoãn ack');
  let drained = false;
  hub.once('drain', () => { drained = true; });
  slow.emit('drain');
  assert.equal(drained, true);

  hub.remove(fast);
  hub.remove(slow);
  assert.equal(hub.size, 0);
  assert.equal(hub.writableEnded, true);
});

test('mục 3 - gắn lại không kèm slot/session vẫn giữ của lần trước; tab cũ đóng không kéo màn xem đi', async () => {
  const pageA = makePage();
  const pageB = makePage();
  const session = makeSession([pageA, pageB]);
  const scObj = { sseResponse: fakeResponse() };
  await attachScreencastSession(scObj, fakeCdp(), pageA, 9, session);

  const cdpB = fakeCdp();
  await attachScreencastSession(scObj, cdpB, pageB); // như route đổi tab: không truyền slot/session
  assert.equal(scObj.slot, 9);
  assert.equal(scObj.session, session);

  pageA.closed = true;
  pageA.emit('close');
  await tick();
  assert.equal(session.created.length, 0, 'không được tự gắn lại vì tab cũ đóng');
  assert.equal(scObj.page, pageB);
  assert.equal(scObj.cdpClient, cdpB);
  stop(scObj);
});

test('mục 3 - releaseScreencast gỡ listener trước khi detach: detach không kích hoạt tự khôi phục', async () => {
  const page = makePage();
  const session = makeSession([page]);
  const cdp = fakeCdp();
  cdp.detach = async () => { cdp.emit('close'); };
  const scObj = { sseResponse: fakeResponse() };
  await attachScreencastSession(scObj, cdp, page, 3, session);
  await releaseScreencast(scObj);
  await tick();
  assert.equal(session.created.length, 0);
  assert.equal(scObj.keepaliveTimer, null);
  stop(scObj);
});

test('mục 5 - CDPSession phát close: tự nối lại sang tab còn sống', async () => {
  const page = makePage();
  const session = makeSession([page]);
  const cdp = fakeCdp();
  const scObj = { sseResponse: fakeResponse() };
  await attachScreencastSession(scObj, cdp, page, 4, session);
  cdp.emit('close');
  await tick();
  assert.equal(session.created.length, 1, 'phải tạo phiên CDP mới');
  assert.equal(scObj.cdpClient, session.created[0]);
  stop(scObj);
});

test('mục 5 - không còn tab để nối lại: đóng kết nối thay vì đứng hình im lặng', async () => {
  const page = makePage();
  const session = makeSession([page]);
  const res = fakeResponse();
  let ended = false;
  res.end = () => { ended = true; res.writableEnded = true; };
  const cdp = fakeCdp();
  const scObj = { sseResponse: res };
  await attachScreencastSession(scObj, cdp, page, 5, session);
  page.closed = true;
  session.mainPage = null;
  cdp.emit('close');
  await tick();
  assert.equal(ended, true);
  stop(scObj);
});
