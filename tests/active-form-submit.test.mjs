import './helpers/obscura-data-fixture.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { findSubmitButton } from '../src/autofill/find-submit-button.mjs';
import { submitFrameForm } from '../src/autofill/submit-frame-form.mjs';
import { resolveActiveFormScope } from '../src/autofill/form-scope/resolve-active-form-scope.mjs';
import { inspectFrameValidation } from '../src/autofill/inspect-frame-validation.mjs';
import { submitVisibleFormFallback } from '../src/autofill/submit-visible-form-fallback.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

test('frame tạm mất execution context giữ khóa form, không mở rộng tìm kiếm ra trang', async () => {
  const scope = { id: 'known', rootSelector: '#known', memberSelector: '#known, #known *', active: true };
  const frame = { evaluate: async () => scope, locator: () => { throw new Error('Không được tìm ngoài phạm vi đã biết'); } };
  await resolveActiveFormScope(frame);
  frame.evaluate = async () => { throw new Error('Execution context was destroyed'); };
  assert.equal((await resolveActiveFormScope(frame)).id, 'known');
  assert.equal(frame._activeAutofillFormScope.unavailable, true);
  assert.equal(await findSubmitButton(frame), null);
});

test('tìm và gửi đúng form đang xử lý trên Chromium', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  await t.test('nút nhãn tùy biến của form chính thắng Continue ở form phụ', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form id="main"><input name="email"><input name="firstname"><button type="button" id="claim">Get Free Samples</button><a href="#privacy">Privacy policy</a></form><form id="secondary"><input><button type="button" id="continue">Continue</button></form>');
    try { assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'claim'); }
    finally { await context.close(); }
  });

  await t.test('form dài nhận nút dưới màn hình; tìm kiếm không cuộn, click giữ onclick và submit', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<form onsubmit="event.preventDefault();this.dataset.submits=1"><input value="ready"><div style="height:1600px"></div><button id="actual" onclick="this.dataset.clicked=1">Claim My Gift</button></form><footer><button id="continue" onclick="this.dataset.clicked=1">Continue</button></footer>');
    try {
      assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'actual');
      assert.equal(await page.evaluate(() => scrollY), 0);
      await submitFrameForm({ options: {}, frame: page, page, session, frameProgress: { filledInThisPass: 1 }, record: {}, screenInfo: {}, scanStartUrl: page.url() });
      assert.equal(await page.locator('form').getAttribute('data-submits'), '1');
      assert.equal(await page.locator('#actual').getAttribute('data-clicked'), '1');
      assert.equal(await page.locator('footer button').getAttribute('data-clicked'), null);
    } finally { await context.close(); }
  });

  await t.test('input và nút liên kết ngoài form vẫn cùng phạm vi và validation', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form id="main"><input name="firstname" value="Alice"></form><input id="email" type="email" required form="main"><button id="linked" form="main">Get Samples</button><form><input><button>Continue</button></form>');
    try {
      const scope = await resolveActiveFormScope(page);
      assert.equal(await (await findSubmitButton(page, scope)).getAttribute('id'), 'linked');
      assert.equal((await page.evaluate(inspectFrameValidation, scope)).id, 'email');
    } finally { await context.close(); }
  });

  await t.test('State về placeholder và ZIP bị từ chối được báo đúng nhãn trước khi bấm gửi', async t => {
    const { context, page, session } = await createFormScopeFixture(browser, `
      <form id="main" onsubmit="event.preventDefault();this.dataset.sent=1">
        <label for="q1">Country</label><select id="q1"><option>US</option><option>CA</option></select>
        <label for="q7">State</label><select id="q7" required><option value="">Choose</option><option selected>TX</option></select>
        <span id="zip-label">Postal code</span><input form="main" type="tel" id="q8" aria-labelledby="zip-label" value="12345">
        <input value="untouched"><button onclick="this.dataset.clicked=1">Continue</button>
      </form><form id="other"><input required aria-label="Other form"></form>`);
    t.after(() => context.close());
    const formScope = await resolveActiveFormScope(page);
    await page.evaluate(() => {
      document.getElementById('q1').onchange = () => {
        const state = document.getElementById('q7').cloneNode(true);
        document.getElementById('q7').replaceWith(state);
        state.value = '';
        document.getElementById('q8').setAttribute('aria-invalid', 'true');
      };
    });
    await page.locator('#q1').selectOption('CA');
    const events = [];
    await submitFrameForm({ options: { aiConfig: { enabled: false }, onLog: event => events.push(event) }, frame: page, page, session,
      frameProgress: { formScope, filledInThisPass: 1 }, record: {}, screenInfo: {}, scanStartUrl: page.url() });
    assert.equal(await page.locator('button').getAttribute('data-clicked'), null);
    const blocked = events.find(event => event.type === 'submit_blocked_fields');
    assert.deepEqual(blocked?.fields, [
      { label: 'State', reason: 'valueMissing' },
      { label: 'Postal code', reason: 'aria-invalid' },
    ]);
    assert.equal(JSON.stringify(blocked).includes('12345'), false);
    assert.equal(session.autofillActions || 0, 0);
    assert.equal(await page.locator('#other input').inputValue(), '');
  });

  await t.test('select bị thay bằng giá trị khác vẫn hợp lệ theo HTML thì giữ lần gửi', async t => {
    const { context, page, session } = await createFormScopeFixture(browser, `
      <form><label for="state">State</label><select id="state" required>
        <option>TX</option><option selected>CA</option></select><button>Continue</button></form>`);
    t.after(() => context.close());
    const events = [];
    await submitFrameForm({ options: { aiConfig: { enabled: false }, onLog: event => events.push(event) },
      frame: page, page, session, frameProgress: { verifiedSelections: [{ id: 'state', value: 'TX' }] },
      record: {}, screenInfo: {}, scanStartUrl: page.url() });
    assert.deepEqual(events.find(event => event.type === 'submit_blocked_fields')?.fields,
      [{ label: 'State', reason: 'selectionChanged' }]);
    assert.equal(await page.locator('select').inputValue(), 'CA');
  });

  await t.test('lỗi đến muộn thuộc lần click, giữ nguyên dữ liệu và tiến độ màn', async t => {
    const { context, page, session } = await createFormScopeFixture(browser, `
      <form id="main">
        <label>State<select id="q7"><option selected>Texas</option></select></label>
        <label for="q8">Postal code</label><input type="tel" id="q8" value="12345">
        <button type="button" onclick="setTimeout(() => q7.setAttribute('aria-invalid','true'), 60);
          setTimeout(() => q8.setAttribute('aria-invalid','true'), 140)">Continue</button>
      </form>`);
    t.after(() => context.close());
    const events = [];
    await submitFrameForm({ options: { aiConfig: { enabled: false }, onLog: event => events.push(event) },
      frame: page, page, session, frameProgress: { filledInThisPass: 1 }, record: {}, screenInfo: {}, scanStartUrl: page.url() });
    const rejection = events.find(event => event.type === 'submit_rejected_fields');
    assert.deepEqual(rejection?.fields.map(field => field.label), ['State', 'Postal code']);
    assert.equal(session.autofillActions || 0, 0);
    assert.equal(session.hasSubmittedCurrentScreen, false);
    assert.equal(await page.locator('#q8').inputValue(), '12345');
  });

  await t.test('requestSubmit dự phòng cũng tôn trọng lỗi của trường nằm ngoài form', async t => {
    const { context, page, session } = await createFormScopeFixture(browser, `
      <form id="main" onsubmit="event.preventDefault();this.dataset.sent=1"><input value="ready"></form>
      <input form="main" aria-label="Postal code" aria-describedby="hint err" type="tel" value="12345">
      <span id="hint">Five digits</span><span class="field-error" id="err">Invalid ZIP</span>`);
    t.after(() => context.close());
    const events = [];
    await submitFrameForm({ options: { aiConfig: { enabled: false }, onLog: event => events.push(event) },
      frame: page, page, session, frameProgress: { filledInThisPass: 1 }, record: {}, screenInfo: {}, scanStartUrl: page.url() });
    assert.equal(await page.locator('form').getAttribute('data-sent'), null);
    assert.deepEqual(events.find(event => event.type === 'submit_blocked_fields')?.fields,
      [{ label: 'Postal code', reason: 'linkedError' }]);
  });

  await t.test('DOM thay form hoặc chuyển bước thì xác định lại scope, không dùng nút cũ', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form id="first"><input><button id="one">Continue</button></form><form id="second" hidden><input><button id="two">Finish</button></form>');
    try {
      assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'one');
      await page.evaluate(() => { document.querySelector('#first').hidden = true; document.querySelector('#second').hidden = false; });
      assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'two');
      await page.evaluate(() => { document.body.innerHTML = '<form><input><button id="replacement">Submit</button></form>'; });
      assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'replacement');
    } finally { await context.close(); }
  });

  await t.test('container không có thẻ form chỉ chọn CTA của chính container', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<div id="signup"><input name="email"><button type="button" id="main-cta">Unlock My Samples</button></div><button id="continue">Continue</button>');
    try { assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'main-cta'); }
    finally { await context.close(); }
  });

  await t.test('đổi nút ở hai bước cùng một form không giữ locator của nút cũ', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form><section id="step-one"><input><button type="button" id="one">Continue</button></section><section id="step-two" hidden><input><button type="button" id="two">Finish</button></section></form>');
    try {
      assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'one');
      await page.evaluate(() => { document.querySelector('#step-one').hidden = true; document.querySelector('#step-two').hidden = false; });
      assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'two');
    } finally { await context.close(); }
  });

  await t.test('nút nằm trong form chính nhưng thuộc form khác không được chọn', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form id="main"><input><input><button type="button" id="claim">Get Samples</button><button form="delete" id="delete-button">Delete</button></form><form id="delete"></form>');
    try { assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'claim'); }
    finally { await context.close(); }
  });

  await t.test('dialog đang mở được ưu tiên hơn form nền', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form><input><input><button id="background">Continue</button></form><div role="dialog"><form><input type="tel"><button id="dialog-submit">Confirm</button></form></div>');
    try { assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'dialog-submit'); }
    finally { await context.close(); }
  });

  await t.test('form chính kết thúc không tự chuyển sang form phụ đã hiện từ đầu', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form id="main"><input><input><button id="primary">Submit</button></form><form id="sidebar"><input id="side-input"><button id="side-button">Continue</button></form>');
    try {
      assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'primary');
      await page.locator('#main').evaluate(form => { form.hidden = true; });
      assert.equal(await findSubmitButton(page), null);
      await page.locator('#side-input').focus();
      assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'side-button');
    } finally { await context.close(); }
  });

  await t.test('không fallback sang form phụ khi form chính đã ẩn hoặc nút bị khóa', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form id="main"><input><input><button disabled>Submit</button></form><form id="other"><input><button onclick="this.dataset.clicked=1">Continue</button></form>');
    try {
      const scope = await resolveActiveFormScope(page);
      assert.equal(await findSubmitButton(page, scope), null);
      assert.equal((await page.evaluate(submitVisibleFormFallback, scope)).method, 'none');
      await page.locator('#main').evaluate(form => { form.hidden = true; });
      assert.equal((await page.evaluate(submitVisibleFormFallback, scope)).method, 'none');
      assert.equal(await page.locator('#other button').getAttribute('data-clicked'), null);
    } finally { await context.close(); }
  });

  await t.test('requestSubmit chỉ dự phòng cho form không có nút; không bỏ qua onclick tùy biến', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form onsubmit="event.preventDefault();this.dataset.submitted=1"><input value="ready"><button type="button" onclick="this.dataset.clicked=1">Custom action</button><button type="button">Another action</button></form>');
    try {
      const scope = await resolveActiveFormScope(page);
      assert.equal((await page.evaluate(submitVisibleFormFallback, scope)).method, 'none');
      assert.equal(await page.locator('form').getAttribute('data-submitted'), null);
      await page.locator('button').evaluateAll(buttons => buttons.forEach(button => button.remove()));
      assert.equal((await page.evaluate(submitVisibleFormFallback, scope)).method, 'form_requestSubmit');
      assert.equal(await page.locator('form').getAttribute('data-submitted'), '1');
    } finally { await context.close(); }
  });
});

test('Obscura chặn select required về placeholder và ZIP được đánh dấu sai', { timeout: 30000 }, async t => {
  try { resolveObscuraBinary(); } catch { t.skip('Chưa có binary Obscura'); return; }
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><form><label for="q7">State</label>
      <select id="q7" required><option value="">Choose</option><option>Texas</option></select>
      <label for="q8">Postal code</label><input id="q8" type="tel" aria-invalid="true">
      <button type="button" onclick="this.dataset.clicked=1">Continue</button></form>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const session = await openObscuraBrowser({ port: 0, slot: 993, registerSession: false });
  t.after(() => session.close());
  const page = session.page;
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const events = [];
  await submitFrameForm({ options: { aiConfig: { enabled: false }, onLog: event => events.push(event) },
    frame: page, page, session: { firstSubmitHandled: true }, frameProgress: { filledInThisPass: 1 },
    record: {}, screenInfo: {}, scanStartUrl: page.url() });
  assert.equal(await page.locator('button').getAttribute('data-clicked'), null);
  assert.deepEqual(events.find(event => event.type === 'submit_blocked_fields')?.fields,
    [{ label: 'State', reason: 'valueMissing' }, { label: 'Postal code', reason: 'aria-invalid' }]);
});
