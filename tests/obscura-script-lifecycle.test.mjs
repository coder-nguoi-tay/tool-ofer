import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';

/**
 * Dựng fixture script offline để đối chiếu lifecycle với Chromium.
 * @return {Promise<http.Server>} Server loopback, không gửi dữ liệu ra ngoài.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function createScriptServer() {
  const server = http.createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture.test').pathname;
    if (path.endsWith('.js')) {
      response.setHeader('Content-Type', 'application/javascript');
      const scripts = {
        '/slow.js': [180, "order.push('slow');"],
        '/fast.js': [20, "order.push('fast');const input=document.createElement('input');input.type='email';document.body.appendChild(input);"],
        '/defer.js': [5, "order.push('defer:'+document.readyState);"],
        '/throw.js': [0, "throw new Error('fixture error');"],
        '/async-import.js': [20, "import('too-late').then(module=>window.importValue=module.value).catch(()=>window.importValue='rejected');"],
        '/later-module.js': [0, "export const value='later-map';"],
      };
      if (!scripts[path]) { response.writeHead(404); response.end('window.badExecuted=true;'); return; }
      const [delay, source] = scripts[path];
      setTimeout(() => response.end(source), delay);
      return;
    }
    const fixtures = {
      '/async': `<script async src="/slow.js" onload="order.push('slow-load')"></script>
        <script async src="/fast.js" onload="order.push('fast-load')"></script><script>order.push('inline')</script>`,
      '/defer': `<script defer src="/defer.js" onload="order.push('defer-load')"></script>
        <script src="/slow.js" onload="order.push('classic-load')"></script><script>order.push('inline')</script>`,
      '/error': `<script src="/missing.js" onerror="order.push('missing-error')" onload="order.push('wrong-load')"></script>
        <script src="/throw.js" onload="order.push('throw-load')"></script><script>order.push('after')</script>`,
      '/import-map': `<script async src="/async-import.js"></script>
        <script type="importmap">{"imports":{"too-late":"/later-module.js"}}</script>`,
    };
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><script>
      window.order=[];window.lifecycle=[];
      document.addEventListener('DOMContentLoaded',event=>{order.push('dcl');lifecycle.push(['document',event.target===document,event.bubbles]);});
      window.addEventListener('DOMContentLoaded',event=>lifecycle.push(['window',event.target===document,event.bubbles]));
      window.addEventListener('load',()=>order.push('load'));
    </script>${fixtures[path] || ''}</head><body></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

/**
 * Đối chiếu thứ tự script, sự kiện và kết quả form qua hai engine thật.
 * @param {import('node:test').TestContext} t Quản lý tài nguyên thử nghiệm.
 * @return {Promise<void>} Hoàn tất so sánh offline.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
test('Obscura khớp Chromium về classic/defer/async, callback lỗi và DOMContentLoaded', { skip: !existsSync(chromium.executablePath()), timeout: 45000 }, async t => {
  const server = await createScriptServer();
  const chrome = await chromium.launch({ headless: true });
  let obscura;
  t.after(async () => {
    await obscura?.close();
    await chrome.close();
    await new Promise(resolve => server.close(resolve));
  });
  obscura = await openObscuraBrowser({ slot: 983, port: 0, registerSession: false });
  const chromePage = await chrome.newPage();
  for (const path of ['/async', '/defer', '/error', '/import-map']) {
    const results = [];
    for (const page of [chromePage, obscura.page]) {
      await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
      if (path === '/import-map') await page.waitForFunction(() => window.importValue !== undefined, null, { timeout: 3000 });
      results.push(await page.evaluate(() => ({
        order: window.order,
        lifecycle: window.lifecycle,
        inputs: document.querySelectorAll('input').length,
        badExecuted: window.badExecuted === true,
        currentScriptCleared: document.currentScript === null,
        importValue: window.importValue ?? null,
      })));
    }
    assert.deepEqual(results[1], results[0], `Khác Chromium tại fixture ${path}`);
  }
});

/**
 * Kiểm tra handler do HTML khai báo khi một form cục bộ bọc, gỡ và thay callback.
 * @param {import('node:test').TestContext} t Quản lý hai trình duyệt dùng cho fixture.
 * @return {Promise<void>} Cả hai engine cập nhật ô phụ và giữ quyết định từ chối gửi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
test('handler của form giữ cập nhật và validation khi trang bọc callback đã khai báo', {
  skip: !existsSync(chromium.executablePath()), timeout: 15000,
}, async t => {
  const chrome = await chromium.launch();
  t.after(() => chrome.close());
  const obscura = await openObscuraBrowser({ slot: 984, port: 0, registerSession: false });
  t.after(() => obscura.close());
  for (const [engine, page] of [['Chromium', await chrome.newPage()], ['Obscura', obscura.page]]) {
    await page.setContent(`<form onsubmit="return false">
      <select onchange="this.form.elements.namedItem('summary').value = this.value">
        <option value="">Choose</option><option value="2">February</option>
      </select>
      <input type="hidden" name="summary">
    </form>`);
    const result = await page.evaluate(() => {
      const form = document.querySelector('form');
      const select = form.querySelector('select');
      const previousChange = select.onchange;
      const previousSubmit = form.onsubmit;
      select.onchange = function (event) { previousChange?.call(this, event); };
      form.onsubmit = function (event) { return previousSubmit?.call(this, event); };
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const allowed = form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return { summary: form.elements.namedItem('summary').value, allowed };
    });
    assert.deepEqual(result, { summary: '2', allowed: false }, engine);

    const mutations = await page.evaluate(() => {
      const input = document.createElement('input');
      const changes = { listener: 0, property: 0 };
      input.addEventListener('input', () => changes.listener++);
      input.oninput = () => changes.property++;
      input.removeAttribute('oninput');
      input.dispatchEvent(new Event('input'));
      const source = "this.setAttribute('data-edited', 'yes')";
      input.setAttribute('oninput', source);
      const stable = input.oninput === input.oninput && typeof input.oninput === 'function';
      input.oninput = null;
      input.dispatchEvent(new Event('input'));
      const cleared = !input.hasAttribute('data-edited');
      input.setAttributeNS(null, 'oninput', source);
      input.dispatchEvent(new Event('input'));
      const restored = input.getAttribute('data-edited');
      input.removeAttributeNS(null, 'oninput');
      return { changes, stable, cleared, restored, removed: input.oninput === null };
    });
    assert.deepEqual(mutations, {
      changes: { listener: 3, property: 1 },
      stable: true, cleared: true, restored: 'yes', removed: true,
    }, engine);
  }
});

/**
 * Đối chiếu constraint validation của select bắt buộc trên form cục bộ.
 * @param {import('node:test').TestContext} t Quản lý trình duyệt kiểm thử.
 * @return {Promise<void>} Hoàn tất đối chiếu placeholder, lựa chọn và sự kiện invalid.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-21
 */
test('select bắt buộc chặn submit khi còn placeholder và cập nhật validity theo lựa chọn', {
  skip: !existsSync(chromium.executablePath()), timeout: 20000,
}, async t => {
  const chrome = await chromium.launch();
  t.after(() => chrome.close());
  const obscura = await openObscuraBrowser({ slot: 986, port: 0, registerSession: false });
  t.after(() => obscura.close());
  for (const [engine, page] of [['Chromium', await chrome.newPage()], ['Obscura', obscura.page]]) {
    await page.setContent(`<form id="choice"><button>Save</button></form>
      <fieldset><select form="choice" required>
        <option value="" hidden>Month</option><option value="2">February</option><option value="">Other</option>
      </select></fieldset>`);
    const result = await page.evaluate(() => {
      const form = document.querySelector('form');
      const select = document.querySelector('select');
      const state = select.validity;
      let invalid = 0;
      let submits = 0;
      select.addEventListener('invalid', event => { if (event.cancelable && !event.bubbles) invalid++; });
      form.addEventListener('submit', event => { submits++; event.preventDefault(); });
      form.requestSubmit();
      const initial = [state.valueMissing, state.valid, form.reportValidity(), invalid, submits];
      select.parentElement.disabled = true;
      const disabled = [select.willValidate, form.checkValidity()];
      select.parentElement.disabled = false;
      select.value = '2';
      form.requestSubmit();
      const selected = [state.valueMissing, form.checkValidity(), submits];
      select.setCustomValidity('Invalid choice');
      const custom = form.checkValidity();
      select.setCustomValidity('');
      select.selectedIndex = 2;
      const otherEmpty = state.valid;
      select.selectedIndex = -1;
      const unselected = state.valueMissing;
      select.setAttribute('size', '2');
      select.selectedIndex = 0;
      const listBox = state.valueMissing;
      select.removeAttribute('size');
      select.setAttribute('multiple', '');
      const multiple = state.valueMissing;
      select.removeAttribute('multiple');
      select.innerHTML = '<optgroup label="Group"><option value="" selected>Empty</option></optgroup>';
      const grouped = state.valueMissing;
      const wrapper = document.createElement('span');
      wrapper.appendChild(select.querySelector('option'));
      select.replaceChildren(wrapper);
      return { initial, disabled, selected, custom, otherEmpty, unselected, listBox, multiple, grouped, wrapped: state.valueMissing };
    });
    assert.deepEqual(result, {
      initial: [true, false, false, 2, 0], disabled: [false, true], selected: [false, true, 1],
      custom: false, otherEmpty: true, unselected: true, listBox: false, multiple: false, grouped: false, wrapped: true,
    }, engine);
  }
});
