import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const FILES = [
  'functions/buy711-proxies.js',
  'features/resources/res-api.js',
  'features/resources/res-proxy-queue.js',
  'features/resources/res-proxy711.js',
  'features/resources/res-email.js',
  'features/resources/res-autofill.js',
  'features/resources/res-setup.js',
];

/**
 * Chạy script tab Tài nguyên của mini trên DOM giả, ghi lại request và trả JSON giả theo URL.
 * @param {object} [replies] JSON trả về theo URL (mặc định `{}`).
 * @return {Promise<object>} DOM giả, danh sách request, alert/toast đã hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function createMini(replies = {}) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, value: '', checked: false, disabled: false, textContent: '', innerHTML: '', style: {}, options: [],
        classList: { contains: () => true },
        appendChild(child) { this.options.push(child); },
        addEventListener(type, handler) { this[type] = handler; },
      });
    }
    return elements.get(id);
  };
  const requests = [];
  const alerts = [];
  const toasts = [];
  const context = vm.createContext({
    document: {
      getElementById: el,
      querySelector: () => el('navResources'),
      querySelectorAll: () => [],
      createElement: () => ({}),
    },
    showToast: msg => toasts.push(msg),
    alert: msg => alerts.push(msg),
    confirm: () => true,
    escHtml: s => String(s ?? ''),
    pollResources() {},
    setInterval() {},
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
      return { json: async () => replies[url] ?? {} };
    },
  });
  for (const file of FILES) {
    vm.runInContext(readFileSync(new URL(`../ui/mini/${file}`, import.meta.url), 'utf8'), context);
  }
  await new Promise(resolve => setImmediate(resolve)); // chờ các request nạp cấu hình lúc khởi động xong
  requests.length = 0;
  return { context, el, requests, alerts, toasts };
}

test('nạp proxy gửi kèm proxyType và mode append', async () => {
  const { el, requests, alerts } = await createMini({ '/proxy-queue/import': { added: 2, available: 2, used: 0, message: 'ok' } });
  el('taProxyInput').value = '1.1.1.1:80\n2.2.2.2:80';
  el('resProxyType').value = 'http';
  await el('resBtnImportProxy').click();
  assert.deepEqual(alerts, []);
  assert.deepEqual(requests[0], {
    url: '/proxy-queue/import', method: 'POST',
    body: { proxyList: '1.1.1.1:80\n2.2.2.2:80', proxyType: 'http', mode: 'append' },
  });
  assert.equal(el('resProxyHealthRatio').textContent, '100% sẵn sàng (2/2)');
});

test('lọc trùng proxy giữ thứ tự, email so khớp không phân biệt hoa thường', async () => {
  const { el } = await createMini();
  el('taProxyInput').value = 'a\n\nb\na';
  el('resBtnDedupeProxy').click();
  assert.equal(el('taProxyInput').value, 'a\nb');
  el('taEmailInput').value = 'X@a.com\nx@a.com';
  el('resBtnDedupeEmail').click();
  assert.equal(el('taEmailInput').value, 'x@a.com');
});

test('lưu Sub-user 711 và tạo proxy gửi đúng payload như desktop', async () => {
  const { el, requests, alerts } = await createMini({ '/711proxy/config': { ok: true }, '/711proxy/generate': { ok: true, added: 30, message: 'Đã nạp 30' } });
  el('res711ModeSubuser').checked = true;
  el('res711SubUser').value = ' mac1 ';
  el('res711SubPass').value = 'pw';
  el('res711Gateway').value = 'us.rotgbapi.trustsource.live:10000';
  await el('res711BtnSaveSubuser').click();
  assert.deepEqual(requests[0].body, {
    authMode: 'subuser', subuser: 'mac1', subpass: 'pw', gatewayHost: 'us.rotgbapi.trustsource.live', gatewayPort: 10000,
  });

  el('res711Region').value = 'GB';
  el('res711Count').value = '30';
  el('res711SessTime').value = '15';
  el('res711SessAuto').checked = false;
  el('res711AutoRefill').checked = true;
  await el('res711BtnGenerate').click();
  assert.deepEqual(alerts, []);
  assert.deepEqual(requests[1], {
    url: '/711proxy/autorefill', method: 'POST',
    body: { enabled: true, region: 'GB', count: 30, sessTime: 15, sessAuto: false },
  });
  assert.deepEqual(requests[2], {
    url: '/711proxy/generate', method: 'POST',
    body: { authMode: 'subuser', subuser: 'mac1', subpass: 'pw', gateway: 'us.rotgbapi.trustsource.live:10000', region: 'GB', count: 30, sessTime: 15, sessAuto: false },
  });
  assert.equal(el('res711BtnGenerate').disabled, false);
});

test('buy711Proxies nhận {ok, added} là thành công, {error} là lỗi', async () => {
  const ok = await createMini({ '/711proxy/generate': { ok: true, added: 20, message: 'Đã nạp 20 proxy' } });
  await ok.context.buy711Proxies(20);
  assert.deepEqual(ok.alerts, []);
  assert.equal(ok.toasts.at(-1), 'Đã nạp 20 proxy');
  assert.deepEqual(ok.requests[0].body, { count: 20 });

  const bad = await createMini({ '/711proxy/generate': { error: 'Chưa nhập Sub-user' } });
  await bad.context.buy711Proxies(20);
  assert.deepEqual(bad.alerts, ['Lỗi mua: Chưa nhập Sub-user']);
});

test('xoá tất cả email và lưu cấu hình tự động nạp email', async () => {
  const { el, requests } = await createMini();
  await el('resBtnClearEmail').click();
  assert.deepEqual(requests[0], { url: '/email-queue/clear', method: 'POST', body: {} });

  el('resEmailAutoRefill').checked = true;
  el('resEmailAutoRefillPath').value = ' /tmp/mails.txt ';
  el('resEmailAutoRefillBatch').value = '500';
  await el('resEmailAutoRefill').change();
  assert.deepEqual(requests.at(-1).body, { enabled: true, sourcePath: '/tmp/mails.txt', batchSize: 500 });

  await el('resBtnLoadEmailFromPath').click();
  assert.deepEqual(requests.find(r => r.url === '/email-queue/load-from-path').body, { sourcePath: '/tmp/mails.txt', batchSize: 500 });

  await el('resBtnResetEmailCursor').click();
  assert.deepEqual(requests.at(-1).body, { resetCursor: true });
});

test('nạp bộ lead dựng sẵn thay toàn bộ hàng đợi Autofill', async () => {
  const { el, requests, alerts } = await createMini({ '/autofill-queue/import': { success: true, message: 'ok' } });
  await el('resBtnLeadZip5').click();
  await el('resBtnLeadFull').click();
  assert.deepEqual(alerts, []);
  const imports = requests.filter(r => r.url === '/autofill-queue/import').map(r => r.body);
  assert.deepEqual(imports, [
    { filePath: '/Users/codernguoitay/Downloads/json_full_da_loai_zipcode_4_ky_tu.json', replace: true },
    { filePath: '/Users/codernguoitay/Downloads/INFO NEW/info-new-autofill.json', replace: true },
  ]);
});

test('Kiểm tra IP hiện IP máy Mac qua server, không tra IP của điện thoại', async () => {
  const { context, el, requests } = await createMini({ '/proxy/public-ip': { ip: '203.0.113.7' } });
  assert.equal(await context.miniResCheckMyIp(), '203.0.113.7');
  assert.equal(requests[0].url, '/proxy/public-ip');
  assert.equal(el('res711MyIp').textContent, '203.0.113.7');
});
