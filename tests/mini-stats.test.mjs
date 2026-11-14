import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const FILES = [
  'functions/esc-html.js', 'features/stats/shared.js', 'features/stats/logs.js', 'features/stats/leads.js', 'features/stats/bandwidth.js', 'features/stats/running.js',
  'functions/poll-logs.js', 'functions/poll-toffers-overview.js', 'functions/render-active-slots-list.js',
  'setup/btn-clear-logs-click.js',
];

/**
 * Nạp các file tab Thống kê của giao diện mini (nối như bundle) trên DOM giả, ghi lại request gửi đi.
 * @param {object} options `confirm` trả về của hộp xác nhận, `storage` giá trị localStorage ban đầu.
 * @return {object} VM, DOM giả và các request đã gửi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function createMini({ confirm = true, storage = {} } = {}) {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, checked: false, value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
        classList: { contains: () => true, toggle() {} },
        addEventListener(type, handler) { this[type] = handler; },
      });
    }
    return elements.get(id);
  };
  const requests = [];
  const confirms = [];
  const context = vm.createContext({
    document: { getElementById: getElement },
    window: { confirm: message => { confirms.push(message); return confirm; } },
    localStorage: { getItem: key => storage[key] ?? null, setItem: (key, value) => { storage[key] = value; } },
    activeSessions: [], tg: null, showToast() {}, pollState() {}, URLSearchParams,
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET', headers: options.headers && { ...options.headers }, body: options.body ? JSON.parse(options.body) : undefined });
      return { ok: true, json: async () => ({ ok: true, success: true, sessions: [], results: [], seq: 0 }) };
    },
  });
  const source = FILES.map(file => readFileSync(new URL(`../ui/mini/${file}`, import.meta.url), 'utf8')).join('\n;\n');
  vm.runInContext(source, context);
  return { context, getElement, requests, confirms };
}

test('mini xoá log chỉ gửi POST sau khi xác nhận, kèm phạm vi offer đang chọn', async () => {
  const declined = createMini({ confirm: false });
  await declined.getElement('btnClearLogs').click();
  assert.equal(declined.confirms.length, 1);
  assert.equal(declined.requests.some(r => r.url === '/browser-logs/clear'), false);

  const { context, getElement, requests, confirms } = createMini({ confirm: true });
  context.miniStatsSetLogOffer('2');
  await getElement('btnClearLogs').click();
  assert.match(confirms[0], /Offer 2/);
  const clear = requests.find(r => r.url === '/browser-logs/clear');
  assert.equal(clear.method, 'POST');
  assert.deepEqual(clear.body, { offer: '2' });
  assert.ok(requests.some(r => r.url === '/browser-logs'), 'tải lại log đủ sau khi xoá');

  context.miniStatsSetLogOffer('all');
  await context.miniStatsClearLogs();
  assert.deepEqual(requests.filter(r => r.url === '/browser-logs/clear')[1].body, {});
});

test('mini đặt lại băng thông bằng POST JSON {scope}', async () => {
  const declined = createMini({ confirm: false });
  await declined.context.miniStatsResetBandwidth('all');
  assert.equal(declined.requests.length, 0);

  const { context, requests } = createMini();
  await context.miniStatsResetBandwidth('today');
  const reset = requests.find(r => r.url === '/bandwidth/reset');
  assert.equal(reset.method, 'POST');
  assert.equal(reset.headers['Content-Type'], 'application/json');
  assert.deepEqual(reset.body, { scope: 'today' });
});

test('mini lấy lead Toffers theo ô datas và cookie (ô trống thì dùng cookie đã lưu)', async () => {
  const { context, getElement, requests } = createMini({ storage: { toffers_custom_cookie: 'saved=1' } });
  getElement('stLeadDatas').value = '2001';
  await context.pollToffersOverview(true);
  assert.deepEqual(requests[0], { url: '/toffers/overview', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { datas: '2001', cookie: 'saved=1', forceRefresh: true } });

  getElement('stLeadDatas').value = '';
  getElement('stLeadCookie').value = 'typed=2';
  await context.pollToffersOverview(true);
  assert.deepEqual(requests[1].body, { datas: '1504', cookie: 'typed=2', forceRefresh: true });

  getElement('stLeadAuto').checked = false;
  await context.pollToffersOverview();
  assert.equal(requests.length, 2, 'tắt tự làm mới thì không poll nền');
});

test('mini hiện/ẩn cửa sổ từng slot gọi đúng endpoint POST', async () => {
  const { context, requests } = createMini();
  await context.miniStatsToggleWindow(3, true);
  await context.miniStatsToggleWindow(4, false);
  assert.deepEqual(requests.map(r => [r.method, r.url]), [['POST', '/browser/hide/3'], ['POST', '/browser/show/4']]);
});

test('mini chạy AI cho slot gửi {slot: number}', async () => {
  const { context, getElement, requests } = createMini();
  getElement('stAiSlot').value = '2';
  await context.miniStatsTriggerAi();
  assert.deepEqual(requests[0], { url: '/ai/trigger', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { slot: 2 } });
});

test('mini liệt kê luồng với nút ẩn/hiện, email/mật khẩu và lọc theo offer', () => {
  const { context, getElement } = createMini();
  vm.runInContext(`activeSessions = [
    { slot: 1, exitIp: '1.1.1.1', offerNumber: 1, isWindowVisible: true, assignedEmail: 'a@b.c', assignedPass: 'pw', assignedRecover: 'note', leadCheckStatus: 'matched' },
    { slot: 2, exitIp: '2.2.2.2', offerNumber: 2 },
  ];`, context);
  context.renderActiveSlotsList();
  const html = getElement('activeSlotsList').innerHTML;
  assert.match(html, /miniStatsToggleWindow\(1, true\)/);
  assert.match(html, /miniStatsToggleWindow\(2, false\)/);
  assert.match(html, /data-copy="a@b.c"/);
  assert.match(html, /🎯 Có lead/);
  assert.equal(getElement('stActiveIps').textContent, 'IP đang chạy: S1: 1.1.1.1, S2: 2.2.2.2');
  context.miniStatsSetRunOffer('2');
  assert.doesNotMatch(getElement('activeSlotsList').innerHTML, /Slot 1 •/);
});
