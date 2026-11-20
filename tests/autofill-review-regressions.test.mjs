import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { selectOptionWithHumanInteraction } from '../src/autofill/select/select-option-with-human-interaction.mjs';
import { selectCustomOptionWithHumanInteraction } from '../src/autofill/select/select-custom-option-with-human-interaction.mjs';
import { fillSelectOrTextField } from '../src/autofill/fill-select-or-text-field.mjs';
import { takeNextRecord } from '../src/records/actions/take-next-record.mjs';
import { autofillQueue } from '../src/runtime/constants/autofill-queue.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { clickYesNoContinue } from '../src/autofill/yes-no/click-continue.mjs';

const browserAvailable = existsSync(chromium.executablePath());
/**
 * Tạo trang thử offline cho kiểm tra chọn dropdown.
 * @param {object} t Ngữ cảnh test và cleanup.
 * @param {string} html Form mẫu không chứa dữ liệu thật.
 * @return {Promise<object>} Trang Chromium cô lập.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function fixturePage(t, html) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(html);
  return page;
}

test('custom chọn chính xác Virginia, không lấy West Virginia và không ép DOM để báo thành công', { skip: !browserAvailable }, async t => {
  const page = await fixturePage(t, `<select id="s" hidden><option value="">Choose</option><option value="VA">Virginia</option></select>
    <button role="combobox">Open</button><div class="dropdown-menu">
    <div class="dropdown-item" data-value="WV" onclick="window.choice='WV'">West Virginia</div>
    <div class="dropdown-item" data-value="VA" onclick="window.choice='VA'">Virginia</div></div>`);
  const result = await selectOptionWithHumanInteraction({ page, field: await page.$('#s'), candidates: ['VA'] });
  assert.equal(await page.evaluate(() => window.choice), 'VA');
  assert.equal(await page.locator('#s').inputValue(), '');
  assert.equal(result.verified, false);
});

test('select ẩn không nhận nút Submit làm trigger', { skip: !browserAvailable }, async t => {
  const page = await fixturePage(t, `<form onsubmit="event.preventDefault();window.submits=1"><select id="s" hidden>
    <option value="">Choose</option><option value="VA">Virginia</option></select><button type="submit">Continue</button></form>`);
  const result = await selectOptionWithHumanInteraction({ page, field: await page.$('#s'), candidates: ['VA'] });
  assert.equal(result.verified, false);
  assert.equal(await page.evaluate(() => window.submits || 0), 0);
});

test('form aria-busy giữ nguyên giá trị và không phát change', { skip: !browserAvailable }, async t => {
  const page = await fixturePage(t, `<div aria-busy="true"><select id="s" onchange="window.changes=1">
    <option value="">Choose</option><option value="VA">Virginia</option></select></div>`);
  const result = await selectOptionWithHumanInteraction({ page, field: await page.$('#s'), candidates: ['VA'] });
  assert.equal(result.verified, false);
  assert.equal(await page.locator('#s').inputValue(), '');
  assert.equal(await page.evaluate(() => window.changes || 0), 0);
});

test('native select chỉ phát một change và không đi qua đáp án trung gian', { skip: !browserAvailable }, async t => {
  const page = await fixturePage(t, `<select id="s" onchange="(window.changes??=[]).push(this.value)"><option value="">Choose</option>
    ${Array.from({ length: 8 }, (_, i) => `<option value="${i}">Option ${i}</option>`).join('')}</select>`);
  const result = await selectOptionWithHumanInteraction({ page, field: await page.$('#s'), candidates: ['7'] });
  assert.equal(result.verified, true);
  assert.deepEqual(await page.evaluate(() => window.changes), ['7']);
});

test('lead về trong khi xác minh custom: giữ nguyên info và nhả autofill', { skip: !browserAvailable }, async t => {
  const page = await fixturePage(t, `<select id="s" hidden><option value="">Choose</option><option value="VA">Virginia</option></select>
    <button id="open">Open</button><div role="option" data-value="VA" onclick="confirmLead()">Virginia</div>`);
  const session = { stopAutofillOnLead: true, enableLeadCheck: true, exitIp: '203.0.113.10' };
  page._autofillSession = session;
  await page.exposeFunction('confirmLead', () => { session.confirmedLeadIp = session.exitIp; });
  const result = await selectCustomOptionWithHumanInteraction({ page, field: await page.$('#s'), trigger: await page.$('#open'), target: { value: 'VA', label: 'Virginia', index: 1 } });
  assert.equal(result.reason, 'lead_confirmed_paused');
  assert.equal(await page.locator('#s').inputValue(), '');
});

test('dropdown chưa tải không giữ vòng quét 1,5 giây mỗi lần', { skip: !browserAvailable }, async t => {
  const page = await fixturePage(t, '<select id="s"><option value="">Choose</option></select>');
  const started = Date.now();
  for (let pass = 0; pass < 2; pass++) await fillSelectOrTextField({ metadata: { kind: 'select', id: 's' }, field: await page.$('#s'), page, valueToFill: 'VA', options: {}, frame: page, unmatchedFieldNames: new Set() });
  assert.ok(Date.now() - started < 1000, 'không chờ lại 1,5s cho mỗi lượt');
});

test('Continue không bấm khi loader thứ hai còn hiện, không tiêu lượt thử', { skip: !browserAvailable }, async t => {
  const page = await fixturePage(t, '<div class="spinner" hidden></div><div class="Processing">Loading</div><button id="continue" onclick="window.clicked=1">Continue</button>');
  const state = { attempts: 0, nextAt: 0 };
  const result = await clickYesNoContinue({ frame: page, page, scope: null, state, options: {} });
  assert.equal(result.actions, 0);
  assert.equal(state.attempts, 0);
  assert.equal(await page.evaluate(() => window.clicked || 0), 0);
});

test('20 phiên song song cấp info riêng dù mỗi phiên nhận bản sao pool', async () => {
  const records = Array.from({ length: 20 }, (_, i) => ({ firstname: `Fixture${i}`, phone: `202555${String(i).padStart(4, '0')}` }));
  const sessions = Array.from({ length: 20 }, () => ({}));
  try {
    const assigned = await Promise.all(sessions.map(async session => takeNextRecord(structuredClone(records), [], session)));
    assert.equal(new Set(assigned.map(record => record.phone)).size, 20);
    assigned[0].firstname = 'Changed';
    assert.equal(records[0].firstname, 'Fixture0');
    assert.deepEqual(takeNextRecord(records, [], {}), {}, 'không tái dùng info đang chạy khi hết pool');
  } finally { sessions.forEach(session => { session.isClosed = true; }); }
});

test('queue bản ghi trùng và pool used không cấp lại info đang thuộc trình duyệt khác', () => {
  const first = {}, second = {};
  const record = { firstname: 'DuplicateFixture', phone: '2025550199' };
  autofillQueue.available.push(record, { ...record });
  try {
    assert.equal(takeNextRecord(autofillQueue.available, [], first).phone, record.phone);
    assert.deepEqual(takeNextRecord(autofillQueue.available, [], second), {});
    assert.deepEqual(takeNextRecord(autofillQueue.used, [], second), {});
    first.isClosed = true;
    activeBrowsers.add(first);
    assert.deepEqual(takeNextRecord(autofillQueue.used, [], second), {}, 'phiên đang dừng nhưng còn active vẫn giữ info');
    activeBrowsers.delete(first);
    assert.equal(takeNextRecord(autofillQueue.used, [], second).phone, record.phone);
  } finally {
    first.isClosed = true; second.isClosed = true;
    activeBrowsers.delete(first);
    autofillQueue.available.length = 0; autofillQueue.used.length = 0;
  }
});

test('hai context chạy autofill song song giữ info riêng khi tải lại trang', { skip: !browserAvailable, timeout: 45000 }, async t => {
  const { attachAutofill } = await import('../src/autofill/attach-autofill.mjs');
  const browser = await chromium.launch({ headless: true });
  const sessions = [];
  t.after(async () => { sessions.forEach(session => { session.isClosed = true; }); await browser.close(); });
  const records = [{ firstname: 'ParallelAlpha', lastname: 'Fixture', phone: '2025550111' }, { firstname: 'ParallelBeta', lastname: 'Fixture', phone: '2025550112' }];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext();
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Registration</h1><form><label>First name<input name="firstname"></label><label>Last name<input name="lastname"></label><label>Phone<input type="tel" name="phone"></label><button type="submit">Continue</button></form>' }));
    const page = await context.newPage();
    await page.goto('https://fixture.test/form');
    const session = { mainPage: page, slot: i + 1, enableLeadCheck: false, isClosed: false };
    sessions.push(session);
    attachAutofill(context, structuredClone(records), 'https://fixture.test', session, { autoSubmit: false, enableLeadCheck: false });
  }
  /**
   * Chờ và đọc chính ba giá trị đã xác nhận của fixture, kể cả khi tab chạy nền.
   * @param {object} session Phiên Chromium cô lập của lượt kiểm thử.
   * @return {Promise<object>} Tên, họ và số điện thoại thật đang hiện trên form mẫu.
   * @throws {Error} Khi các ô còn thiếu sau thời gian chờ của lượt kiểm tra.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  async function readConfirmedFixtureRecord(session) {
    const fields = ['firstname', 'lastname', 'phone'];
    const formValues = await session.mainPage.waitForFunction(names => {
      const values = {};
      for (const name of names) {
        const field = document.getElementsByName(name)[0];
        if (field?.dataset.uxFilled !== '1') return false;
        values[name] = field.value;
      }
      return values;
    }, fields, { polling: 100, timeout: 20000 });
    try { return await formValues.jsonValue(); }
    finally { await formValues.dispose(); }
  }
  const beforeReload = await Promise.all(sessions.map(readConfirmedFixtureRecord));
  const sourceRecords = beforeReload.map(record => ({ ...record, phone: record.phone.replace(/[() -]/g, '') }));
  assert.deepEqual(sourceRecords.sort((a, b) => a.phone.localeCompare(b.phone)), records);
  await Promise.all(sessions.map(session => session.mainPage.reload()));
  assert.deepEqual(await Promise.all(sessions.map(readConfirmedFixtureRecord)), beforeReload);
});

test('đổi info bị form từ chối không lấy record của phiên đang chạy song song', async () => {
  const { handleFormRejected } = await import('../src/records/actions/handle-form-rejected.mjs');
  const first = { mainPage: {} }, second = {};
  const records = [{ firstname: 'RejectedFixture', phone: '2025550131' }, { firstname: 'BusyFixture', phone: '2025550132' }, { firstname: 'FreeFixture', phone: '2025550133' }];
  try {
    first.currentRecord = takeNextRecord([records[0]], [], first);
    second.currentRecord = takeNextRecord([records[1]], [], second);
    autofillQueue.available.push({ ...records[1] }, records[2]);
    const replacement = await handleFormRejected(first, { kind: 'record', record: first.currentRecord });
    assert.equal(replacement.phone, records[2].phone);
    assert.equal(first.mainPage._assignedRecord.phone, records[2].phone);
    assert.equal(second.currentRecord.phone, records[1].phone);
  } finally {
    first.isClosed = true; second.isClosed = true;
    autofillQueue.available.length = 0; autofillQueue.used.length = 0;
  }
});

test('pool chỉ có email vẫn cấp hai email khác nhau, không khóa chung thành record rỗng', () => {
  const first = {}, second = {};
  const records = [{ email: 'alpha@example.invalid' }, { email: 'beta@example.invalid' }];
  try {
    const assigned = [takeNextRecord(records, [], first), takeNextRecord(records, [], second)];
    assert.equal(new Set(assigned.map(record => record.email)).size, 2);
  } finally { first.isClosed = true; second.isClosed = true; }
});
