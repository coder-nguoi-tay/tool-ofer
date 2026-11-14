import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const FILES = [
  'features/settings/settings-api.js',
  'features/settings/pc-settings.js',
  'features/settings/telegram-settings.js',
  'features/settings/ai-settings.js',
  'features/screen/screen-tools.js',
];
const DEVICES = ['windows', 'windows11', 'macos-intel', 'macos-arm', 'linux', 'android'];

/**
 * Nạp các file tab Cài đặt / công cụ Màn hình của mini vào VM với DOM và fetch giả.
 * @param {object} responses Phản hồi giả theo URL (khớp tiền tố).
 * @return {object} VM, DOM giả và danh sách request đã gửi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function createMini(responses = {}) {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { id, checked: false, value: '', textContent: '', placeholder: '', dataset: {}, style: {} });
    return elements.get(id);
  };
  const devices = DEVICES.map(key => ({ checked: true, dataset: { gologinDevice: key } }));
  const requests = [];
  const toasts = [];
  const context = vm.createContext({
    document: {
      getElementById: getElement,
      querySelectorAll: selector => (selector === '#setGologinDevices [data-gologin-device]' ? devices : []),
    },
    window: {}, currentSlot: 3, toasts,
    showToast: msg => toasts.push(msg),
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
      const key = Object.keys(responses).find(prefix => url.startsWith(prefix));
      return { ok: true, status: 200, json: async () => (key ? responses[key] : {}) };
    },
  });
  vm.runInContext(FILES.map(file => readFileSync(new URL(`../ui/mini/${file}`, import.meta.url), 'utf8')).join('\n;\n'), context);
  return { context, getElement, devices, requests, toasts };
}

test('bundle mini nối các file mới vẫn là script hợp lệ', () => {
  const all = [...FILES, 'features/settings/setup.js', 'features/screen/setup.js'];
  assert.doesNotThrow(() => new vm.Script(all.map(file => readFileSync(new URL(`../ui/mini/${file}`, import.meta.url), 'utf8')).join('\n;\n')));
});

test('lưu cài đặt PC: token chỉ gửi khi vừa nhập, thiết bị, chống fingerprint, OS từ tab Vận hành', async () => {
  const { context, getElement, devices, requests } = createMini({ '/pc/settings/save': { success: true } });
  devices[1].checked = false;
  getElement('setAfCanvas').checked = true;
  getElement('setAfWebrtc').checked = false;
  getElement('chkMac').checked = true;
  getElement('chkIpad').checked = true;
  assert.equal(await context.miniSetSavePcSettings(), true);
  const { url, body } = requests.at(-1);
  assert.equal(url, '/pc/settings/save');
  assert.equal('gologinToken' in body, false, 'ô token trống thì giữ token cũ');
  assert.deepEqual(body.gologinDevices, DEVICES.filter(key => key !== 'windows11'));
  assert.equal(body.browserMode, 'Chrome');
  assert.equal(body.Canvas, true);
  assert.equal(body.WebRTC, false);
  assert.equal(body.Mac, true);
  assert.equal(body.iPad, true);
  assert.equal(body.Windows, false);

  getElement('setGologinToken').value = '  tok-123  ';
  await context.miniSetSavePcSettings();
  assert.equal(requests.at(-1).body.gologinToken, 'tok-123');
  assert.equal(getElement('setGologinToken').value, '', 'token vừa lưu bị xóa khỏi ô nhập');
});

test('nạp cài đặt PC không hiện token và không ghi đè OS của tab Vận hành', async () => {
  const { context, getElement, devices } = createMini({ '/pc/settings/read': { gologinConfigured: true, gologinDevices: ['linux'], Canvas: true, WebRTC: false, Mac: true } });
  await context.miniSetLoadPcSettings();
  assert.deepEqual(devices.filter(d => d.checked).map(d => d.dataset.gologinDevice), ['linux']);
  assert.equal(getElement('setGologinToken').value, '');
  assert.match(getElement('setGologinTokenStatus').textContent, /Đã cấu hình/);
  assert.equal(getElement('setAfCanvas').checked, true);
  assert.equal(getElement('setAfWebrtc').checked, false);
  assert.equal(getElement('chkMac').checked, false);
});

test('miniSetGetLaunchOverrides trả đúng trường như payload Start của desktop', () => {
  const { context, getElement, devices } = createMini();
  for (const id of ['setAfClientRects', 'setAfWebgl', 'setAfFonts', 'setAfApiFakeIp']) getElement(id).checked = true;
  devices[0].checked = false;
  assert.deepEqual(JSON.parse(JSON.stringify(context.miniSetGetLaunchOverrides())), {
    antiFpCanvas: false, antiFpClientRects: true, antiFpWebgl: true, antiFpFonts: true, antiFpWebrtc: false, antiFpApiFakeIP: true,
    gologinDevices: DEVICES.slice(1),
  });
});

test('AI: timeout hiển thị đúng giá trị lưu (không cắt 15s) và bật/tắt AI Assist lưu đủ cấu hình', async () => {
  const saved = { enabled: true, mode: 'continuous', cliBinary: 'agy', maxRounds: 7, timeoutSeconds: 120, solveBotQuiz: false, customInstructions: 'giữ nguyên' };
  const { context, getElement, requests } = createMini({ '/ai/config': saved });
  await context.miniSetLoadAi();
  assert.equal(getElement('setAiTimeout').value, 120);
  assert.equal(context.miniSetIsAiAssistEnabled(), true);

  requests.length = 0;
  saved.success = true;
  assert.equal(await context.miniSetSetAiAssistEnabled(false), true);
  const { url, method, body } = requests.at(-1);
  assert.equal(url, '/ai/config');
  assert.equal(method, 'POST');
  assert.equal(body.mode, 'disabled');
  assert.equal(body.enabled, false);
  assert.equal(body.timeoutSeconds, 120);
  assert.equal(body.maxRounds, 7);
  assert.equal(body.solveBotQuiz, false);
  assert.equal(body.customInstructions, 'giữ nguyên');
  assert.equal(getElement('setAiMode').value, 'disabled');
  assert.equal(context.miniSetIsAiAssistEnabled(), false);

  await context.miniSetSetAiAssistEnabled(true);
  assert.equal(requests.at(-1).body.mode, 'auto_on_stuck');
  assert.equal(requests.at(-1).body.enabled, true);
  assert.equal(context.miniSetIsAiAssistEnabled(), true);
});

test('AI Assist không lưu khi chưa đọc được cấu hình (tránh ghi đè chỉ dẫn)', async () => {
  const { context, requests } = createMini({ '/ai/config': { error: 'down' } });
  assert.equal(await context.miniSetSetAiAssistEnabled(true), false);
  assert.equal(requests.some(r => r.method === 'POST'), false);
});

test('Telegram: lưu đúng body, không đưa token đã lưu ra ô nhập', async () => {
  const { context, getElement, requests } = createMini({ '/telegram/config': { ok: true, hasToken: true, botTokenMasked: '12345678…abcd', allowedUserId: '42', configured: true } });
  getElement('setTgToken').value = ' 123:abc ';
  getElement('setTgUserId').value = '42';
  getElement('setTgChatId').value = '-100';
  assert.equal(await context.miniSetSaveTelegram(), true);
  const post = requests.find(r => r.method === 'POST');
  assert.equal(post.url, '/telegram/config');
  assert.deepEqual(post.body, { botToken: '123:abc', allowedUserId: '42', notifyChatId: '-100' });
  assert.equal(getElement('setTgToken').value, '');
  assert.match(getElement('setTgToken').placeholder, /12345678…abcd/);
});

test('Màn hình: điều hướng, DevTools và mở ra Desktop gọi đúng endpoint theo currentSlot', async () => {
  const { context, getElement, requests } = createMini({
    '/screen/navigate/': { ok: true, url: 'https://example.com/' },
    '/screen/devtools/': { mode: 'native' },
    '/browser/show/': { ok: true },
  });
  getElement('scrUrlInput').value = 'example.com';
  assert.equal(await context.miniScreenNavigate(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), { url: '/screen/navigate/3', method: 'POST', body: { url: 'example.com' } });
  assert.equal(getElement('urlDisplay').textContent, 'https://example.com/');
  await context.miniScreenOpenDevtools();
  assert.equal(requests[1].url, '/screen/devtools/3');
  assert.equal(requests[1].method, 'POST');
  await context.miniScreenPopOut();
  assert.equal(requests[2].url, '/browser/show/3');
});
