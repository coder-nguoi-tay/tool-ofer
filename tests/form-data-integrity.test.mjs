import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { chromium } from 'playwright';
import { matchFieldValue } from '../src/autofill/match-field-value.mjs';
import { parseAutofillRecords } from '../src/autofill/parse-autofill-records.mjs';
import { getNormalizedPhone } from '../src/autofill/get-normalized-phone.mjs';
import { getDobString } from '../src/autofill/get-dob-string.mjs';
import { resolveProvidedFieldValue } from '../src/autofill/record-values/resolve-provided-field-value.mjs';
import { markValidFormValue } from '../src/autofill/mark-valid-form-value.mjs';
import { isSwappedContactValue } from '../src/autofill/resolve-contact-field.mjs';
import { handlePostScreenInput } from '../src/http/routes/screen/post-input.mjs';
import { screencastSessions } from '../src/runtime/constants/screencast-sessions.mjs';
import { captureManualTextField, sendBoundManualFieldInput } from '../src/browser/screen/manual-text-field.mjs';
import { startObscuraSession } from '../src/obscura-engine/start-obscura-session.mjs';
import { stopObscuraSession } from '../src/obscura-engine/stop-obscura-session.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { findFreePort } from '../src/obscura-engine/find-free-port.mjs';

/**
 * Gửi thao tác tay qua route thật bằng request/response trong bộ nhớ.
 * @param {number} slot Slot chứa nguồn giả lập.
 * @param {object} command Nội dung thao tác cần kiểm tra.
 * @param {object} [connection] Thông tin kết nối của giao diện gửi thao tác.
 * @return {Promise<object>} Trạng thái HTTP và JSON trả về.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function sendManualInput(slot, command, connection = {}) {
  const request = Readable.from([JSON.stringify(command)]);
  Object.assign(request, { method: 'POST', url: '/screen/input/' + slot }, connection);
  const response = { writeHead(code) { this.statusCode = code; }, end(body) { this.body = JSON.parse(body); } };
  await handlePostScreenInput(request, response);
  return response;
}

test('chèn cột hồ sơ do người dùng chọn đúng ô và đúng bản ghi của tab', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<input id="recipient" aria-label="Recipient identifier">');
  const field = page.locator('input');
  const slot = 9986;
  const screenSourceId = 'record-picker-fixture';
  const record = { ein: '00-0000000', nickname: "Test O’Neil", floor: 0, empty: '', __internal: 'hidden' };
  page._assignedRecord = record;
  const cdpClient = await page.context().newCDPSession(page);
  screencastSessions.set(slot, { page, cdpClient, screenSourceId });
  t.after(() => screencastSessions.delete(slot));
  const local = { headers: { host: 'localhost:3211', origin: 'http://localhost:3211' }, socket: { remoteAddress: '::1', localPort: 3211 } };
  const proxy = { ...local, headers: { ...local.headers, 'x-forwarded-for': '192.0.2.1' } };
  const otherOrigin = { ...local, headers: { ...local.headers, origin: 'https://fixture.invalid' } };
  const lan = { ...local, socket: { ...local.socket, remoteAddress: '192.0.2.2' } };
  const { x, y, width, height } = await field.boundingBox();
  const click = { type: 'click', x: x + width / 2, y: y + height / 2, screenSourceId };
  const remoteInfo = (await sendManualInput(slot, click, proxy)).body.input;
  assert.ok(remoteInfo.fieldId);
  assert.equal(remoteInfo.recordFields, undefined);
  const info = (await sendManualInput(slot, click, local)).body.input;
  assert.deepEqual(info.recordFields, ['ein', 'nickname', 'floor']);
  assert.doesNotMatch(JSON.stringify(info), /00-0000000|Test O’Neil|hidden/);
  const insert = { type: 'insertRecordField', screenSourceId, fieldId: info.fieldId, recordField: 'ein' };
  for (const connection of [proxy, otherOrigin, lan]) assert.equal((await sendManualInput(slot, insert, connection)).statusCode, 403);
  assert.equal((await sendManualInput(slot, { ...insert, fieldId: 'stale' }, local)).statusCode, 409);
  assert.equal((await sendManualInput(slot, { ...insert, recordField: '__internal' }, local)).statusCode, 409);
  const result = await sendManualInput(slot, insert, local);
  assert.equal(result.statusCode, 200);
  assert.doesNotMatch(JSON.stringify(result.body), /00-0000000/);
  assert.equal((await sendManualInput(slot, insert, local)).statusCode, 409);
  assert.equal(await field.inputValue(), record.ein);
  const next = (await sendManualInput(slot, { ...click, type: 'mousedown' }, local)).body.input;
  await sendManualInput(slot, { ...click, type: 'mouseup' }, local);
  assert.deepEqual(next.recordFields, info.recordFields);
  page._assignedRecord = { ...record, ein: 'replacement' };
  assert.equal((await sendManualInput(slot, { ...insert, fieldId: next.fieldId }, local)).statusCode, 409);
  assert.equal(await field.inputValue(), record.ein);
  await field.fill('');
  await field.evaluate(node => node.addEventListener('input', () => { node.value = 'ID-' + node.value; }, { once: true }));
  const formatted = (await sendManualInput(slot, click, local)).body.input;
  const retry = { ...insert, fieldId: formatted.fieldId, recordField: 'nickname' };
  assert.equal((await sendManualInput(slot, retry, local)).statusCode, 422);
  assert.equal((await sendManualInput(slot, retry, local)).statusCode, 409);
  assert.equal(await field.inputValue(), 'ID-' + record.nickname);
});

test('hồ sơ giữ số nguồn và thiếu dữ liệu tên/ngày sinh không tự tạo giá trị', () => {
  assert.equal(getNormalizedPhone({ phone: '2025550147' }), '2025550147');
  assert.equal(getNormalizedPhone({}), '');
  const imported = parseAutofillRecords('email,phone\nfixture@example.invalid,2025550147');
  assert.equal(imported[0].phone, '2025550147');
  const phones = { phone: '2025550147', homephone: '2025550180', workphone: '2025550190' };
  for (const [label, expected] of [['Home Phone', phones.homephone], ['Work Phone', phones.workphone], ['Phone', phones.phone]]) {
    const metadata = { label, type: 'tel', names: [label] };
    assert.equal(matchFieldValue(metadata.names, phones, metadata), expected);
    assert.equal(resolveProvidedFieldValue(metadata, phones), expected);
  }
  assert.equal(matchFieldValue(['Work Phone'], { phone: phones.phone }), null);
  assert.equal(matchFieldValue(['Home Phone'], phones, { label: 'Home Phone', autocomplete: 'work tel' }), null);
  assert.equal(getDobString({ birthmonth: '11', birthyear: '1994' }), '');
  assert.equal(getDobString({ namsinh: '1994' }), '');
  assert.equal(matchFieldValue(['year'], { namsinh: '1994' }), '1994');
  for (const dob of ['1994', '1994-02-29']) {
    assert.equal(getDobString({ dob }), '');
    assert.equal(matchFieldValue(['dob'], { dob }), null);
  }
  assert.equal(getDobString({ dob: '1996-02-29' }), '1996-02-29');
  assert.equal(getDobString({ namsinh: '4/18/1994' }), '4/18/1994');
  assert.equal(getDobString({ birthmonth: '03', birthday: '09', namsinh: '1994' }), '03/09/1994');
  for (const label of ['First Name', 'First visit']) {
    assert.equal(matchFieldValue([label], { email: 'fixture.person@example.invalid' }, { label, type: 'text', names: [label] }), null);
  }
  for (const label of ['Last visit', 'Family size', 'Survey']) {
    assert.equal(matchFieldValue([label], { lastname: 'Tran' }, { label, type: 'text', names: [label] }), null, label);
  }
  assert.equal(matchFieldValue(['Surname'], { lastname: 'Tran' }), 'Tran');
  const names = { firstname: 'Nicole', lastname: 'Tran', fullname: 'Nicole Tran' };
  for (const [label, maxLength, expected] of [
    ['First visit', 30, null], ['Family size', 30, null], ['Name of employer', 30, null],
    ['First name', 2, null], ['First name', 6, 'Nicole'], ['Name', 5, null],
  ]) {
    const metadata = { label, maxLength, type: 'text', names: [label] };
    assert.equal(matchFieldValue(metadata.names, names, metadata), expected, label);
    assert.equal(resolveProvidedFieldValue(metadata, names), expected, label);
  }
  assert.equal(isSwappedContactValue('firstname', 'Tran', { fullname: 'An Tran' }, true), true);
  assert.equal(isSwappedContactValue('firstname', 'Tran', { fullname: 'An Tran' }, false), false);
});

test('phân biệt EIN với SSN dù hồ sơ cấp cả hai cột định danh', () => {
  const record = { ein: '00-0000000', ssn: '000-00-0000' };
  const mixed = { name: 'ein', id: 'ssn', type: 'text', names: ['ein', 'ssn'] };
  assert.equal(matchFieldValue(['ssn', 'ein'], record, { ...mixed, names: ['ssn', 'ein'] }), null);
  assert.equal(resolveProvidedFieldValue(mixed, record), null);
  for (const key of ['ssn', 'ein']) {
    const metadata = { name: key, label: key.toUpperCase(), names: [key], type: 'text' };
    assert.equal(matchFieldValue(metadata.names, record, metadata), record[key]);
  }
});

test('đánh dấu ô hợp lệ tôn trọng pattern, giới hạn ngày và lỗi do trang khai báo', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<input id="phone" pattern="[0-9]{10,11}" value="+1 (202) 555-0147" data-ux-filled="1"><input id="date" type="date" min="2000-01-01" value="1994-11-01"><input id="custom" aria-invalid="true" value="fixture">');
  for (const id of ['phone', 'date', 'custom']) {
    const field = page.locator('#' + id);
    assert.equal(await field.evaluate(markValidFormValue, await field.inputValue()), false);
    assert.equal(await field.getAttribute('data-ux-filled'), null);
  }
  await page.locator('#phone').fill('2025550147');
  assert.equal(await page.locator('#phone').evaluate(markValidFormValue, '2025550147'), true);
  assert.equal(await page.locator('#phone').evaluate(markValidFormValue, '8145550147'), false);
});

test('thao tác từ ảnh tab cũ bị từ chối trước khi nhập dữ liệu', async t => {
  const slot = 9999;
  const values = [];
  const page = { isClosed: () => false, keyboard: { insertText: async text => values.push(text) } };
  const previous = screencastSessions.get(slot);
  screencastSessions.set(slot, { page, screenSourceId: 'new-tab' });
  t.after(() => previous ? screencastSessions.set(slot, previous) : screencastSessions.delete(slot));
  for (const screenSourceId of [undefined, 'old-tab']) {
    const response = await sendManualInput(slot, { type: 'insertText', text: 'fixture', screenSourceId });
    assert.equal(response.statusCode, 409);
  }
  assert.deepEqual(values, []);
  const command = { type: 'insertText', text: 'fixture', screenSourceId: 'new-tab' };
  const response = await sendManualInput(slot, command);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(values, ['fixture']);
  page.keyboard.insertText = async () => { throw new Error(command.text); };
  const failed = await sendManualInput(slot, command);
  assert.equal(failed.statusCode, 502);
  assert.doesNotMatch(failed.body.error, /fixture/);
  const keyCommand = { type: 'press', key: 'Tab', screenSourceId: 'new-tab' };
  page.keyboard.press = async key => values.push(key);
  assert.equal((await sendManualInput(slot, keyCommand)).statusCode, 200);
  assert.deepEqual(values, ['fixture', 'Tab']);
  page.keyboard.press = async () => { throw new Error('fixture'); };
  const rejectedKey = await sendManualInput(slot, keyCommand);
  assert.equal(rejectedKey.statusCode, 502);
  assert.doesNotMatch(rejectedKey.body.error, /fixture/);
  assert.equal((await sendManualInput(slot, { ...keyCommand, key: '' })).statusCode, 400);
  page.isClosed = () => true;
  assert.equal((await sendManualInput(slot, keyCommand)).statusCode, 409);
});

test('trả lời prompt một lần và dọn đúng tab khi người xem khác chuyển nguồn', async t => {
  const slot = 9998;
  const previous = screencastSessions.get(slot);
  t.after(() => previous ? screencastSessions.set(slot, previous) : screencastSessions.delete(slot));
  let beginAnswer, finishAnswer;
  const entered = new Promise(resolve => { beginAnswer = resolve; });
  const finished = new Promise(resolve => { finishAnswer = resolve; });
  const answers = [];
  const pending = { id: 'first-dialog', dialog: {
    async accept(value) { answers.push(value); beginAnswer(); await finished; },
  } };
  const first = { _manualFormDialog: pending };
  const second = { _manualFormDialog: { id: 'second-dialog' } };
  const stream = { page: first };
  screencastSessions.set(slot, stream);
  const command = { type: 'dialog', dialogId: pending.id, accept: true, promptText: '' };
  const answering = sendManualInput(slot, command);
  await entered;
  try {
    assert.equal((await sendManualInput(slot, command)).statusCode, 409);
    stream.page = second;
  } finally {
    finishAnswer();
  }
  assert.equal((await answering).statusCode, 200);
  assert.equal(first._manualFormDialog, undefined);
  assert.equal(second._manualFormDialog.id, 'second-dialog');
  assert.deepEqual(answers, ['']);
});

test('hộp nhập thủ công gắn với chính ô trong iframe và shadow root, giữ vùng chọn và từ chối focus cũ', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<iframe srcdoc="<div id=host></div><input id=other>"></iframe>');
  const frame = page.frameLocator('iframe');
  await frame.locator('#host').evaluate(host => {
    host.attachShadow({ mode: 'open' }).innerHTML = '<input id="draft" value="first last">';
  });
  const draft = frame.locator('#draft');
  const { x, y, width, height } = await draft.boundingBox();
  const slot = 9997;
  const screenSourceId = 'manual-field-fixture';
  const cdpClient = await page.context().newCDPSession(page);
  screencastSessions.set(slot, { page, cdpClient, screenSourceId });
  t.after(() => screencastSessions.delete(slot));
  const click = { type: 'click', x: x + width / 2, y: y + height / 2, screenSourceId };
  const { body: { input } } = await sendManualInput(slot, click);
  assert.ok(input.fieldId);
  assert.equal('value' in input, false);
  const insert = { type: 'insertText', text: 'new', fieldId: input.fieldId, screenSourceId };
  await draft.evaluate(field => field.setSelectionRange(0, 5));
  assert.equal((await sendManualInput(slot, insert)).statusCode, 200);
  assert.equal(await draft.inputValue(), 'new last');
  await draft.evaluate(field => field.addEventListener('beforeinput', event => event.preventDefault(), { once: true }));
  assert.equal((await sendManualInput(slot, insert)).statusCode, 422);
  assert.equal(await draft.inputValue(), 'new last');
  await draft.evaluate(field => field.addEventListener('beforeinput', () => document.querySelector('#other').focus(), { once: true }));
  assert.equal((await sendManualInput(slot, insert)).statusCode, 409);
  const press = { type: 'press', key: 'Tab', fieldId: input.fieldId, screenSourceId };
  assert.equal((await sendManualInput(slot, press)).statusCode, 409);
  assert.equal(await frame.locator('#other').inputValue(), '');
  await draft.focus();
  await draft.evaluate(field => { field.readOnly = true; });
  assert.equal((await sendManualInput(slot, insert)).statusCode, 409);
  await draft.evaluate(field => {
    const replacement = field.cloneNode();
    field.replaceWith(replacement);
    replacement.readOnly = false;
    replacement.focus();
  });
  assert.equal((await sendManualInput(slot, insert)).statusCode, 409);
  const reopened = await sendManualInput(slot, click);
  const freshId = reopened.body.input.fieldId;
  assert.notEqual(freshId, input.fieldId);
  assert.equal((await sendManualInput(slot, { ...press, fieldId: freshId })).statusCode, 200);
  assert.equal(await frame.locator('#other').evaluate(field => field === document.activeElement), true);
  await draft.evaluate(field => field.addEventListener('click', () => document.querySelector('#other').focus(), { once: true }));
  assert.equal((await sendManualInput(slot, click)).body.input, null);
});

test('select từ chối danh sách đổi, mục ẩn và giữ đúng value khi nhãn trùng', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const { interactWithScreenSelect } = await import('../src/browser/screen/find-select-at-point.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<select><option value="a">Same</option><option value="b">Same</option><option hidden value="secret">Hidden</option><optgroup hidden><option>Group hidden</option></optgroup></select>');
  const select = page.locator('select');
  const initial = await select.evaluate(interactWithScreenSelect, { uid: 'first' });
  assert.equal(initial.options.length, 2);
  await select.evaluate(el => el.prepend(el.options[1]));
  assert.equal(await select.evaluate(interactWithScreenSelect, { uid: 'first', index: 1 }), false);
  const fresh = await select.evaluate(interactWithScreenSelect, { uid: 'fresh' });
  assert.equal(fresh.options.length, 2);
  assert.equal(await select.evaluate(interactWithScreenSelect, { uid: 'fresh', index: 1 }), true);
  assert.equal(await select.inputValue(), 'a');
  await select.evaluate(interactWithScreenSelect, { uid: 'hidden' });
  await select.evaluate(el => { el.hidden = true; });
  assert.notEqual(await select.evaluate(interactWithScreenSelect, { uid: 'hidden', index: 0 }), true);
});

test('Screen View xác minh lựa chọn trên ô hiện tại khi JavaScript dựng lại select', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const slot = 9997;
  const screenSourceId = 'select-render';
  screencastSessions.set(slot, { page, cdpClient: await page.context().newCDPSession(page), screenSourceId });
  t.after(() => screencastSessions.delete(slot));
  for (const [caseName, expectedStatus] of [
    ['reset', 409], ['preserved', 200], ['reset-next-frame', 409],
    ['ambiguous', 409], ['unrelated-sibling', 409], ['shadow', 200],
  ]) {
    await page.setContent('<form id="fixture"></form>');
    await page.evaluate(scenario => {
      const form = document.querySelector('#fixture');
      const root = scenario === 'shadow' ? form.appendChild(document.createElement('div')).attachShadow({ mode: 'open' }) : form;
      root.innerHTML = '<select name="delivery"><option value="a">Standard</option><option value="b">Expedited</option></select>';
      const field = root.querySelector('select');
      if (scenario !== 'shadow') field.id = 'delivery';
      if (scenario === 'unrelated-sibling') {
        const sibling = root.appendChild(field.cloneNode(true));
        sibling.value = 'b';
      }
      field.addEventListener('change', () => {
        if (scenario === 'unrelated-sibling') { field.remove(); return; }
        const replacement = field.cloneNode(true);
        replacement.removeAttribute('data-ux-screen-select');
        replacement.value = scenario.startsWith('reset') ? 'a' : 'b';
        if (scenario === 'reset-next-frame') {
          queueMicrotask(() => requestAnimationFrame(() => field.replaceWith(replacement)));
        } else {
          field.replaceWith(replacement);
          if (scenario === 'ambiguous') root.appendChild(replacement.cloneNode(true));
        }
      });
    }, caseName);
    const field = page.locator('select').first();
    const box = await field.boundingBox();
    const opened = await sendManualInput(slot, { type: 'click', x: box.x + box.width / 2, y: box.y + box.height / 2, screenSourceId });
    assert.ok(opened.body.select?.uid, caseName);
    const choice = { type: 'select', index: 1, uid: opened.body.select.uid, screenSourceId };
    assert.equal((await sendManualInput(slot, choice)).statusCode, expectedStatus, caseName);
    assert.equal(await field.inputValue(), caseName.startsWith('reset') ? 'a' : 'b', caseName);
  }
});

test('cuộn Screen View dự phòng giữ cả hai trục, báo lỗi nếu mất thao tác có phím bổ trợ', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div style="width:3000px;height:3000px"></div>');
  const slot = 9996;
  const screenSourceId = 'wheel-fixture';
  const cdpClient = { send: async () => { throw new Error('mouseWheel unavailable'); } };
  screencastSessions.set(slot, { page, cdpClient, screenSourceId });
  t.after(() => screencastSessions.delete(slot));
  const wheel = { type: 'wheel', x: 60, y: 60, deltaX: 30, deltaY: 80, screenSourceId };
  assert.equal((await sendManualInput(slot, wheel)).statusCode, 200);
  assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [30, 80]);
  assert.equal((await sendManualInput(slot, { ...wheel, modifiers: 2 })).statusCode, 502);
  assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [30, 80]);
});

test('Obscura nhận đúng phần văn bản người dùng thay trong Screen View và giữ nguyên khi vượt maxlength', async t => {
  try { resolveObscuraBinary(); } catch { return t.skip('Thiếu binary Obscura'); }
  const native = await startObscuraSession({ port: await findFreePort(0) });
  t.after(() => stopObscuraSession(native.process));
  const browser = await chromium.connectOverCDP(native.cdpEndpoint);
  const page = await browser.contexts()[0].newPage();
  await page.goto('data:text/html,<input id="manual" type="text" value="abc" maxlength="4">');
  const field = page.locator('#manual');
  const box = await field.boundingBox();
  const slot = 9995;
  const screenSourceId = 'obscura-manual-field';
  screencastSessions.set(slot, { page, cdpClient: await page.context().newCDPSession(page), screenSourceId });
  t.after(() => screencastSessions.delete(slot));
  const click = await sendManualInput(slot, { type: 'click', x: box.x + box.width / 2, y: box.y + box.height / 2, screenSourceId });
  assert.ok(click.body.input?.fieldId);
  await field.evaluate(element => element.setSelectionRange(1, 2));
  const insert = { type: 'insertText', text: 'Z', fieldId: click.body.input.fieldId, screenSourceId };
  assert.equal((await sendManualInput(slot, insert)).statusCode, 200);
  assert.equal(await field.inputValue(), 'aZc');
  assert.equal((await sendManualInput(slot, { ...insert, text: 'XY' })).statusCode, 422);
  assert.equal(await field.inputValue(), 'aZc');
});

test('Obscura mở select có optgroup, giữ mục bị CSS ẩn và xác minh giá trị sau change', async t => {
  try { resolveObscuraBinary(); } catch { return t.skip('Thiếu binary Obscura'); }
  const native = await startObscuraSession({ port: await findFreePort(0) });
  t.after(() => stopObscuraSession(native.process));
  const browser = await chromium.connectOverCDP(native.cdpEndpoint);
  const page = await browser.contexts()[0].newPage();
  const slot = 9987;
  const screenSourceId = 'obscura-select-render';
  screencastSessions.set(slot, { page, cdpClient: await page.context().newCDPSession(page), screenSourceId });
  t.after(() => screencastSessions.delete(slot));
  for (const scenario of ['normal', 'reset', 'accepted']) {
    await page.goto('data:text/html,' + encodeURIComponent(
      '<style>.omitted{display:none}</style><form><select id="delivery">' +
      '<optgroup label="Delivery"><option value="a" selected>Standard</option><option class="omitted">Hidden</option><option value="b">Expedited</option></optgroup>' +
      '<optgroup class="omitted"><option>Hidden group</option></optgroup><optgroup disabled><option>Unavailable</option></optgroup></select></form>'));
    const field = page.locator('select');
    await field.evaluate((el, scenario) => {
      if (scenario === 'normal') return;
      el.addEventListener('change', () => {
        const replacement = el.cloneNode(true);
        replacement.value = scenario === 'accepted' ? 'b' : 'a';
        el.replaceWith(replacement);
      });
    }, scenario);
    const box = await field.boundingBox();
    const opened = await sendManualInput(slot, { type: 'click', x: box.x + box.width / 2, y: box.y + box.height / 2, screenSourceId });
    assert.deepEqual(opened.body.select?.options, [
      { label: 'Standard', disabled: false }, { label: 'Expedited', disabled: false }, { label: 'Unavailable', disabled: true },
    ], scenario);
    assert.equal(opened.body.select.selectedIndex, 0);
    const disabledChoice = await sendManualInput(slot, { type: 'select', index: 2, uid: opened.body.select.uid, screenSourceId });
    assert.equal(disabledChoice.statusCode, 400, scenario);
    assert.equal(await field.inputValue(), 'a', scenario);
    const chosen = await sendManualInput(slot, { type: 'select', index: 1, uid: opened.body.select.uid, screenSourceId });
    assert.equal(chosen.statusCode, scenario === 'reset' ? 409 : 200, scenario);
    assert.equal(await field.inputValue(), scenario === 'reset' ? 'a' : 'b', scenario);
    if (scenario === 'normal') {
      assert.deepEqual(await field.evaluate(select => [
        select.selectedIndex, select.options[0].defaultSelected, select.querySelector('option:checked')?.value,
      ]), [2, true, 'b']);
      await field.evaluate(select => select.form.reset());
      assert.equal(await field.inputValue(), 'a');
    }
  }
});

test('nhập tay thay email đã chọn, giữ số khi nhập sai và nhận ra khi form từ chối chữ hoặc đổi focus trước phím', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<input id="email" type="email" maxlength="5" value="a@b.c"><input id="amount" type="number" value="5"><input id="fixed" value="x">');
  const frame = page.mainFrame();
  for (const [id, value, expected, expectedValue] of [
    ['email', 'x@y.z', true, 'x@y.z'],
    ['amount', 'Q', false, '5'],
    ['fixed', 'y', false, 'x'],
  ]) {
    const field = page.locator('#' + id);
    await field.evaluate(el => {
      el.focus();
      el.select();
      if (el.id === 'fixed') el.addEventListener('input', () => { el.value = 'x'; }, { once: true });
    });
    const input = await field.evaluate(captureManualTextField, id);
    assert.equal(await sendBoundManualFieldInput({ input, frame }, { fieldId: id, type: 'insertText', text: value }), expected);
    assert.equal(await field.inputValue(), expectedValue);
  }
  const amount = page.locator('#amount');
  await amount.focus();
  await page.keyboard.press('End');
  const numericInput = await amount.evaluate(captureManualTextField, 'numeric-fragment');
  assert.equal(await sendBoundManualFieldInput({ input: numericInput, frame }, {
    type: 'insertText', text: '+', fieldId: numericInput.fieldId,
  }), false);
  assert.equal(await amount.inputValue(), '5');
  await page.locator('#fixed').focus();
  const input = await page.locator('#fixed').evaluate(captureManualTextField, 'key-fixture');
  await page.evaluate(() => window.keyCount = 0);
  await page.evaluate(() => document.addEventListener('keydown', () => window.keyCount++));
  const changingFrame = { async evaluateHandle(callback, command) {
    const guard = await frame.evaluateHandle(callback, command);
    await page.locator('#amount').focus();
    return guard;
  } };
  assert.equal(await sendBoundManualFieldInput({ input, frame: changingFrame }, {
    type: 'press', key: 'Enter', fieldId: input.fieldId,
  }), null);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'amount');
  assert.equal(await page.evaluate(() => window.keyCount), 0);
});

test('select động giữ lựa chọn hợp lệ khi danh sách thay đổi và dùng đúng giá trị gửi form', async t => {
  try { resolveObscuraBinary(); } catch { return t.skip('Thiếu binary Obscura'); }
  const native = await startObscuraSession({ port: await findFreePort(0) });
  t.after(() => stopObscuraSession(native.process));
  const browser = await chromium.connectOverCDP(native.cdpEndpoint);
  const page = await browser.contexts()[0].newPage();

  await t.test('xóa optgroup đang chọn sẽ chọn lại mục khả dụng', async () => {
    await page.setContent('<form><select name="region"><option disabled>Choose</option><option>A</option><optgroup label="Other"><option>B</option></optgroup></select></form>');
    const result = await page.locator('select').evaluate(select => {
      select.selectedIndex = 2;
      select.querySelector('optgroup').remove();
      const restored = [select.selectedIndex, select.options[1].selected, new FormData(select.form).get('region')];
      select.selectedIndex = -1;
      return [...restored, select.selectedIndex];
    });
    assert.deepEqual(result, [1, true, 'A', -1]);
  });

  await t.test('option không có value dùng chữ đã chuẩn hóa khoảng trắng HTML', async () => {
    await page.setContent('<form><select name="region"><option value=" A ">Explicit</option><option>  New\n   York  </option><option>A&nbsp;B</option></select></form>');
    const result = await page.locator('select').evaluate(select => {
      const explicit = select.value;
      select.value = 'New York';
      return [explicit, select.selectedIndex, select.value, select.options[1].text, new FormData(select.form).get('region'), select.options[2].value];
    });
    assert.deepEqual(result, [' A ', 1, 'New York', 'New York', 'New York', 'A\u00a0B']);
  });
});
