import { attachAutofillPageWatcher } from '../src/autofill/attach-autofill-page-watcher.mjs';
import { setGlobalAiConfig } from '../src/ai-assist/set-global-ai-config.mjs';
import { globalAiConfig } from '../src/ai-assist/state/global-ai-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { createAgySession } from '../src/continuous-agent/agy-stream-session.mjs';
import { startContinuousAgent, stopContinuousAgent, getContinuousAgentState } from '../src/continuous-agent/index.mjs';
import { buildFirstPrompt, buildNextPrompt } from '../src/continuous-agent/build-turn-prompt.mjs';
import { moduleState } from '../src/ai-assist/state/module-state.mjs';
import { runAiAssist } from '../src/ai-assist/run-ai-assist.mjs';

/**
 * Child process giả: ghi lại các dòng stdin và cho test phát event stdout.
 * @return {object} child giả có kill/emit.
 */
function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.lines = [];
  let buffer = '';
  child.stdin.on('data', chunk => { buffer += chunk; let index; while ((index = buffer.indexOf('\n')) >= 0) { child.lines.push(JSON.parse(buffer.slice(0, index))); buffer = buffer.slice(index + 1); } });
  child.killed = false;
  child.kill = () => { child.killed = true; setImmediate(() => child.emit('close', null)); };
  child.reply = (response, status = 'SUCCESS') => child.stdout.write(`${JSON.stringify({ event: 'result', result: { conversation_id: 'c1', status, response, error: status === 'SUCCESS' ? undefined : 'boom', usage: { input_tokens: 1 } } })}\n`);
  return child;
}

test('agy stream: một process cho nhiều lượt, đúng khung NDJSON, lỗi/đóng giữa lượt reset hội thoại', async () => {
  const children = [];
  const session = createAgySession({ spawnFn: () => { const child = fakeChild(); children.push(child); return child; }, timeoutMs: 5000 });
  const first = session.send('một');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(children[0].lines[0], { event: 'user', message: { content: 'một' } });
  children[0].reply('[]');
  assert.equal((await first).text, '[]');
  const second = session.send('hai');
  await new Promise(resolve => setImmediate(resolve));
  children[0].reply('[{"action":"check","selector":"#a"}]');
  await second;
  assert.equal(children.length, 1, 'không spawn lại giữa các lượt');
  assert.equal(session.turns, 2);
  assert.equal(children[0].lines.length, 2);

  const failing = session.send('ba');
  await new Promise(resolve => setImmediate(resolve));
  children[0].reply('', 'ERROR');
  await assert.rejects(failing, /agy: boom/);

  const dying = session.send('bốn');
  await new Promise(resolve => setImmediate(resolve));
  children[0].emit('close', 1);
  await assert.rejects(dying, /agy thoát/);
  assert.equal(session.turns, 0);
  const again = session.send('năm');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(children.length, 2, 'lượt sau process chết thì spawn mới');
  session.kill();
  await assert.rejects(again, /agy_closed/);
  assert.equal(children[1].killed, true);
});

test('agy stream: timeout giết process và từ chối lượt, không cho hai lượt chồng nhau', async () => {
  const children = [];
  const session = createAgySession({ spawnFn: () => { const child = fakeChild(); children.push(child); return child; }, timeoutMs: 30 });
  const pending = session.send('x');
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(session.send('y'), /turn_in_flight/);
  await assert.rejects(pending, /timeout/);
  assert.equal(children[0].killed, true);
});

test('prompt: lượt đầu có luật và giữ record trong app, lượt sau chỉ giao diện + lỗi trước', () => {
  const first = buildFirstPrompt({ url: 'https://a.test', record: { email: 'u@x.test' }, html: '<input>' });
  assert.ok(!first.includes('u@x.test') && first.includes('KHÔNG submit'));
  const next = buildNextPrompt({ url: 'https://a.test', html: '<input id=b>', feedback: ['fill #a: missing_record'] });
  assert.ok(!next.includes('u@x.test') && next.includes('missing_record') && next.includes('<input id=b>'));
});

test('startContinuousAgent chỉ chạy ở mode continuous + agy; giữ nguyên các mode khác', () => {
  const page = { isClosed: () => false, once() {} };
  const session = {};
  const transport = () => { throw new Error('không được tạo transport'); };
  assert.equal(startContinuousAgent(page, () => ({}), session, { aiConfig: { enabled: true, mode: 'auto_on_stuck' }, createTransport: transport }), null);
  assert.equal(startContinuousAgent(page, () => ({}), session, { aiConfig: { enabled: false, mode: 'continuous' }, createTransport: transport }), null);
  assert.equal(startContinuousAgent(page, () => ({}), session, { aiConfig: { enabled: true, mode: 'continuous', cliBinary: 'codex' }, createTransport: transport }), null);
  assert.equal(startContinuousAgent(page, () => ({}), { offerMode: 'manual' }, { aiConfig: { enabled: true, mode: 'continuous' }, createTransport: transport }), null);
});

test('agent liên tục: một hội thoại qua nhiều màn, giá trị lấy từ record, nhả capacity/cờ, Stop dọn sạch', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, '<form id="f"><input name="email" id="email" type="email"><input name="fname" id="fname"></form>');
  t.after(() => context.close());
  const startCount = moduleState.agtRunningCount;
  const prompts = [], logs = [];
  let killed = 0, turns = 0, closed = 0;
  const replies = [
    '[{"action":"fill","selector":"#email","value":"bia-ra@ai.test"}]',
    '[]',
  ];
  const transport = {
    get turns() { return turns; },
    async send(prompt) { prompts.push(prompt); turns += 1; return { text: replies.shift() ?? '[]' }; },
    close() { closed += 1; turns = 0; },
    kill() { killed += 1; },
  };
  let scans = 0;
  session.triggerAutofillScan = () => { scans += 1; };
  session.addLog = entry => logs.push(entry);
  const record = { email: 'dung@record.test', firstname: 'An' };
  const agent = startContinuousAgent(page, () => record, session, { aiConfig: { enabled: true, mode: 'continuous', cliBinary: 'agy' }, createTransport: () => transport });
  assert.ok(agent);
  assert.equal(startContinuousAgent(page, () => record, session, { aiConfig: { enabled: true, mode: 'continuous' }, createTransport: () => { throw new Error('tạo agent thứ hai'); } }), agent, 'một tab một agent');
  assert.equal(page._continuousAgent, agent);

  const until = async (predicate, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } assert.fail(`quá hạn: ${predicate}`); };
  await until(() => prompts.length >= 1);
  await until(async () => (await page.inputValue('#email')) === 'dung@record.test');
  assert.notEqual(await page.inputValue('#email'), 'bia-ra@ai.test', 'giá trị do app lấy từ record, không dùng giá trị AI bịa');
  assert.ok(!prompts[0].includes('dung@record.test'));
  await until(() => scans >= 1);
  assert.equal(page._aiAssistRunning, false, 'nhả tab cho autofill sau khi thực thi');
  assert.equal(moduleState.agtRunningCount, startCount, 'nhả capacity đúng một lần');

  // Màn mới xuất hiện → lượt tiếp theo dùng prompt rút gọn trong cùng hội thoại.
  await page.evaluate(() => { document.querySelector('#f').insertAdjacentHTML('beforeend', '<input name="zip" id="zip">'); });
  await until(() => prompts.length >= 2);
  assert.ok(!prompts[1].includes('KHÔNG submit') && prompts[1].startsWith('Giao diện mới'), 'lượt sau không gửi lại luật/record');
  assert.equal(closed, 0, 'không đóng/mở lại hội thoại giữa các màn');
  assert.ok(['waiting_page', 'thinking', 'acting', 'queued'].includes(getContinuousAgentState(page).status));
  assert.ok(getContinuousAgentState(page).actionCount >= 1);

  assert.equal(stopContinuousAgent(page, 'test'), true);
  assert.equal(stopContinuousAgent(page, 'test'), false, 'Stop idempotent');
  assert.equal(killed >= 1, true);
  assert.equal(getContinuousAgentState(page), null);
  assert.equal(page._continuousAgent, null);
  assert.equal(page._aiAssistRunning, false);
  await agent.done;
  assert.equal(moduleState.agtRunningCount, startCount);
});

test('luồng AI cũ nhường tab khi continuous agent đang giữ', async () => {
  const page = { isClosed: () => false, url: () => 'https://a.test/', _continuousAgent: {} };
  const session = {};
  await runAiAssist(page, {}, session, { aiConfig: { enabled: true, mode: 'continuous' } });
  assert.equal(page._aiAssistRunning, undefined);
  assert.equal(session.aiRunningPages?.size ?? 0, 0, 'không đăng ký tab vào luồng cũ');
});

test('lỗi agy: backoff, không đổi provider, giữ tab; Stop trong lúc backoff thoát ngay', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, '<input name="email" id="email">');
  t.after(() => context.close());
  const startCount = moduleState.agtRunningCount;
  let sends = 0;
  const transport = { turns: 0, async send() { sends += 1; throw new Error('quota exceeded'); }, close() {}, kill() {} };
  const logs = [];
  session.addLog = entry => logs.push(entry);
  const agent = startContinuousAgent(page, () => ({ email: 'a@b.test' }), session, { aiConfig: { enabled: true, mode: 'continuous' }, createTransport: () => transport });
  const end = Date.now() + 10000;
  while (sends < 1 && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(sends, 1, 'backoff: không gọi dồn');
  assert.equal(getContinuousAgentState(page).status, 'backing_off');
  assert.equal(page._aiAssistRunning, false);
  assert.equal(moduleState.agtRunningCount, startCount);
  stopContinuousAgent(page);
  await agent.done;
  assert.ok(logs.some(entry => entry.type === 'continuous_error'));
});

test('Stop: nối vào closeActiveBrowsers, stopAll giết agy đang chờ, session đóng lẻ cũng hủy lượt bay trong ~1s', async t => {
  const { readFile } = await import('node:fs/promises');
  const { stopAllContinuousAgents } = await import('../src/continuous-agent/index.mjs');
  const source = await readFile(new URL('../src/browser/actions/close-active-browsers.mjs', import.meta.url), 'utf8');
  assert.match(source, /stopAllContinuousAgents\('close_all'\)/, 'nút Stop/Đóng tất cả phải dừng agent');

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const startCount = moduleState.agtRunningCount;
  const makeAgent = async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<input name="email" id="email">');
    t.after(() => context.close());
    session.triggerAutofillScan = () => {};
    let sendCalled = false, killed = 0, rejectSend;
    const transport = { turns: 0, send: () => { sendCalled = true; return new Promise((_, reject) => { rejectSend = reject; }); }, close() {}, kill() { killed += 1; rejectSend?.(new Error('closed')); } };
    const agent = startContinuousAgent(page, () => ({ email: 'a@b.test' }), session, { aiConfig: { enabled: true, mode: 'continuous' }, createTransport: () => transport });
    const end = Date.now() + 10000;
    while (!sendCalled && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(sendCalled, 'lượt AI đang chờ model');
    return { page, session, agent, getKilled: () => killed };
  };

  const first = await makeAgent();
  assert.equal(page_flag(first.page), true, 'đang giữ tab trong lúc chờ model');
  assert.equal(stopAllContinuousAgents('test'), 1);
  await first.agent.done;
  assert.equal(first.getKilled() >= 1, true);
  assert.equal(first.page._aiAssistRunning, false);
  assert.equal(moduleState.agtRunningCount, startCount, 'nhả capacity khi bị hủy giữa lượt');

  const second = await makeAgent();
  second.session.isClosed = true; // đường đóng lẻ: chỉ đặt cờ
  const began = Date.now();
  await second.agent.done;
  assert.ok(Date.now() - began < 3000, 'watchdog hủy lượt bay trong ~1s');
  assert.equal(second.getKilled() >= 1, true);
  assert.equal(moduleState.agtRunningCount, startCount);
});

/**
 * Cờ owner của tab (test).
 * @param {object} page Tab.
 * @return {boolean} True nếu agent đang giữ tab.
 */
function page_flag(page) { return page._aiAssistRunning === true; }

test('AI Vận hành giữ tab, chỉ điền form đã khai báo, hủy phản hồi muộn và nhả về autofill khi bỏ tích', { timeout: 25000 }, async t => {
  const oldConfig = globalAiConfig;
  t.after(() => setGlobalAiConfig(oldConfig));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, '<form><input id="ordinary"></form>');
  session.mainPage = page;
  page._assignedRecord = { zipcode: '01234', state: 'Texas' };
  const origin = new URL(page.url()).origin;
  const form = '<form data-autoleadpc-mcp="record"><input id="zip" data-autoleadpc-field="zipcode"><select id="state" data-autoleadpc-field="state"><option value="">Choose</option><option value="TX">Texas</option></select></form>';
  const delayed = new EventEmitter();
  const prompts = [];
  let holding = false, kills = 0, autoPasses = 0;
  const transport = {
    turns: 0, close() {}, kill() { kills++; },
    async send(prompt) {
      prompts.push(prompt);
      if (holding) {
        delayed.emit('waiting');
        await new Promise(resolve => delayed.once('release', resolve));
      }
      return { text: '[{"field":"entryA","source":"zipcode"},{"field":"entryB","source":"state"}]' };
    }
  };
  setGlobalAiConfig({ enabled: true, mode: 'form_agent' });
  attachAutofillPageWatcher(page, {
    trackedPages: new WeakSet(), options: { allowedOrigin: origin, createTransport: () => transport }, session,
    fillVisibleForms: async () => { autoPasses++; delayed.emit('auto'); }, record: {}, checkLeadAfterEmailOnPage() {},
    isSpamAdUrl: () => false, watchPage() {}
  });
  assert.ok(page._continuousAgent);
  await page.waitForTimeout(720);
  assert.equal(prompts.length, 0);
  await page.goto('https://unrelated.test/form');
  await page.setContent(form);
  await page.waitForTimeout(720);
  assert.equal(prompts.length, 0);
  await page.goto(origin);
  await page.setContent(form);
  await page.waitForFunction(() => document.querySelector('#state')?.value === 'TX');
  assert.equal(await page.inputValue('#zip'), '01234');
  assert.equal(autoPasses, 0);
  assert.equal(prompts.length, 0);

  holding = true;
  const waiting = new Promise(resolve => delayed.once('waiting', resolve));
  // Chuyển document nhưng giữ cùng tab để kiểm tra vòng đời của agent.
  await page.reload();
  await page.setContent('<form data-autoleadpc-mcp="record"><input aria-label="Postal district" id="zip" data-autoleadpc-field="entryA"><input aria-label="Region of residence" id="region" data-autoleadpc-field="entryB"></form>');
  await waiting;
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].includes('entryA') && prompts[0].includes('entryB'));
  assert.ok(!prompts[0].includes('01234') && !prompts[0].includes('Texas'));
  await page.locator('form').evaluate(form => form.insertAdjacentHTML('beforeend', '<input id="local" data-autoleadpc-field="zipcode">'));
  await page.waitForFunction(() => document.querySelector('#local').value === '01234');
  const stopped = page._continuousAgent;
  setGlobalAiConfig({ enabled: false, mode: 'disabled' });
  assert.equal(page._continuousAgent, null);
  assert.equal(kills, 1);
  delayed.emit('release');
  await stopped.done;
  assert.equal(await page.inputValue('#zip'), '');
  if (!autoPasses) await new Promise(resolve => delayed.once('auto', resolve));
  assert.ok(autoPasses > 0);
  holding = false;
  setGlobalAiConfig({ enabled: true, mode: 'form_agent' });
  session.triggerAutofillScan();
  await page.waitForFunction(() => document.querySelector('#zip')?.value === '01234' && document.querySelector('#region')?.value === 'Texas');
  assert.equal(await page.inputValue('#region'), 'Texas');
  assert.equal(prompts.length, 2);
  const restarted = page._continuousAgent;
  await browser.close();
  await restarted.done;
  assert.equal(getContinuousAgentState(page), null);
  assert.equal(kills, 2);
});

test('Vận hành sửa mặc định, xác minh lựa chọn theo nhóm và chỉ thử lại một lần trên mỗi tab', { timeout: 18000 }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const html = `<form data-autoleadpc-mcp="record">
    <select data-autoleadpc-field="language"><option>English</option><option>Vietnamese</option></select>
    <select data-autoleadpc-field="state"><option>Ohio</option><option value="TX">Texas</option></select>
    <input data-autoleadpc-field="zipcode" value="01234"><input id="missing" required data-autoleadpc-field="email">
    <input type="radio" name="contact" data-autoleadpc-field="contact" value="mail" checked>
    <input type="radio" name="contact" data-autoleadpc-field="contact" value="sms">
    <input type="checkbox" value="a" data-autoleadpc-field="topics" checked><input type="checkbox" value="b" data-autoleadpc-field="topics">
    <input type="checkbox" data-autoleadpc-field="consent"><input type="checkbox" data-autoleadpc-field="optout" checked>
    <select multiple data-autoleadpc-field="channels"><option selected>A</option><option>B</option><option>C</option></select>
    <select multiple data-autoleadpc-field="clear"><option selected>A</option><option selected>B</option></select>
    <select multiple data-autoleadpc-field="ambiguous"><option selected>A</option><option>B</option><option>B</option></select>
  </form><script>
    window.edits = {};
    document.addEventListener('change', ({target}) => {
      const key = target.dataset.autoleadpcField;
      edits[key] = (edits[key] || 0) + 1;
      if (key === 'state' && edits[key] === 1)
        setTimeout(() => { target.selectedIndex = 0; target.add(new Option('Other'), 1); }, 100);
      if (key === 'language') setTimeout(() => {
        const form = document.querySelector('form');
        form.querySelector('[data-autoleadpc-field=language]').selectedIndex = 0;
        const replacement = form.cloneNode(true);
        for (const select of form.querySelectorAll('select:not([multiple])')) {
          replacement.querySelector('[data-autoleadpc-field=' + select.dataset.autoleadpcField + ']').value = select.value;
        }
        for (const option of form.querySelectorAll('select[multiple] option')) {
          const group = replacement.querySelector('[data-autoleadpc-field=' + option.parentNode.dataset.autoleadpcField + ']');
          group.options[option.index].selected = option.selected;
        }
        form.replaceWith(replacement);
      }, 180);
    });
  </script>`;
  const { page, context, session } = await createFormScopeFixture(browser, html);
  const other = await context.newPage();
  await other.goto(page.url());
  await other.setContent('<form data-autoleadpc-mcp="record"><input id="zip" data-autoleadpc-field="zipcode"></form>');
  const { parseAutofillRecords } = await import('../src/autofill/parse-autofill-records.mjs');
  [page._assignedRecord] = parseAutofillRecords(JSON.stringify({ language: 'Vietnamese', state: 'Texas', contact: 'sms', zipcode: '01234',
    mcp_answer_topics: ['b'], mcp_answer_optout: false, mcp_answer_channels: ['B','C'], mcp_answer_clear: [], mcp_answer_ambiguous: ['A','B'] }));
  other._assignedRecord = { zipcode: '98765' };
  const logs = [];
  const options = { aiConfig: { enabled: true, mode: 'form_agent' }, allowedOrigin: new URL(page.url()).origin,
    agentConfig: { transport: 'api', apiBaseUrl: '', apiKey: '', apiModel: '' }, onLog: entry => logs.push(entry) };
  const mainAgent = startContinuousAgent(page, () => page._assignedRecord, session, options);
  const otherAgent = startContinuousAgent(other, () => page._assignedRecord, session, options);
  t.after(() => { stopContinuousAgent(page); stopContinuousAgent(other); });
  assert.ok(mainAgent && otherAgent);
  await other.waitForFunction(() => document.querySelector('#zip').value === '98765');
  await page.waitForFunction(() => edits.language === 2 && edits.state === 2);
  await page.waitForTimeout(1700);
  const result = await page.evaluate(() => ({
    edits, state: document.querySelector('[data-autoleadpc-field=state]').value,
    contact: document.querySelector('[name=contact]:checked').value,
    topics: Array.from(document.querySelectorAll('[data-autoleadpc-field=topics]:checked'), item => item.value),
    consent: document.querySelector('[data-autoleadpc-field=consent]').checked, optout: document.querySelector('[data-autoleadpc-field=optout]').checked,
    groups: Array.from(document.querySelectorAll('select[multiple]'), group => Array.from(group.selectedOptions, item => item.value)) }));
  assert.equal(result.state, 'TX');
  assert.equal(result.contact, 'sms');
  assert.deepEqual(result.topics, ['b']);
  assert.equal(result.consent, false);
  assert.equal(result.optout, false);
  assert.deepEqual(result.groups, [['B','C'], [], ['A']]);
  assert.equal(result.edits.language, 2);
  assert.equal(result.edits.zipcode, undefined);
  assert.equal(result.edits.ambiguous, undefined);
  for (const key of ['language','email','ambiguous']) {
    assert.equal(logs.filter(entry => entry.type === 'form_agent_field_blocked' && entry.field === key).length, 1);
  }
  assert.equal(mainAgent.turnCount + otherAgent.turnCount, 0);
});

test('Vận hành chỉ nhận tên cột khả dụng và hỏi riêng nhãn mới của form', { timeout: 12000 }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<form data-autoleadpc-mcp="record">
    <input aria-label="Where is the household located?" data-autoleadpc-field="entryA">
    <input data-autoleadpc-field="entryB"><input data-autoleadpc-field="entryC">
    <input type="checkbox" required data-autoleadpc-field="permission"></form>`);
  page._assignedRecord = { state: 'Texas', zipcode: '01234', secret: 'fixture-only' };
  const batches = [];
  const agent = startContinuousAgent(page, () => page._assignedRecord, session, {
    allowedOrigin: new URL(page.url()).origin, aiConfig: { enabled: true, mode: 'form_agent', cliBinary: 'agy' },
    createTransport: () => ({ kill() {}, close() {}, async send(prompt) {
      batches.push(JSON.parse(prompt.split('\n').at(-1)));
      return { text: JSON.stringify([{ field: 'entryA', source: 'state' }, { field: 'entryB', source: 'secret' },
        { field: 'entryC', source: 'zipcode', value: 'untrusted' }, { field: 'entryD', source: 'zipcode' }]) };
    } })
  });
  t.after(() => stopContinuousAgent(page));
  await page.waitForFunction(() => document.querySelector('[data-autoleadpc-field=entryA]').value === 'Texas');
  await page.locator('form').evaluate(form => form.insertAdjacentHTML('beforeend', '<input data-autoleadpc-field="entryD">'));
  await page.waitForFunction(() => document.querySelector('[data-autoleadpc-field=entryD]').value === '01234');
  assert.deepEqual(batches.map(batch => batch.fields.map(item => item.field)), [['entryA','entryB','entryC'],['entryD']]);
  assert.deepEqual(batches[0].sources.sort(), ['city','state','zipcode']);
  assert.equal(await page.inputValue('[data-autoleadpc-field=entryB]'), '');
  assert.equal(await page.inputValue('[data-autoleadpc-field=entryC]'), '');
  assert.equal(await page.locator('[type=checkbox]').isChecked(), false);
  assert.equal(agent.turnCount, 2);
});

test('form agent giữ địa chỉ đã chọn khi widget chuẩn hóa chữ, cho phép đổi record và nhập lại khi widget xóa', { timeout: 15000 }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<form data-autoleadpc-mcp="record">
    <div class="form-group"><label>Street address<input id="address" role="combobox" aria-controls="streets" data-autoleadpc-field="address"></label></div>
    <input type="email" name="emailAddress"><input role="combobox" aria-label="City">
    <div id="streets" role="listbox"><button type="button" role="option">10 Oak St</button></div>
    <input name="place_id" type="hidden"><button id="submit" disabled>Submit</button></form>`);
  await page.evaluate(() => {
    const f = document.querySelector('form'), address = f.querySelector('#address'), code = f.elements.place_id;
    address.oninput = () => { code.value = ''; f.querySelector('#submit').disabled = true; f.dataset.writes = String(Number(f.dataset.writes || 0) + 1); };
    f.querySelector('[role=option]').onclick = () => { address.value = '10 Oak Street, Unit A'; code.value = 'test-10'; address.setAttribute('aria-invalid', 'true');
      setTimeout(() => { address.removeAttribute('aria-invalid'); f.querySelector('#submit').disabled = false; }, 1100); };
  });
  page._assignedRecord = { address: '10 Oak St' };
  const mappedFields = [];
  const agent = startContinuousAgent(page, () => page._assignedRecord, session, {
    allowedOrigin: new URL(page.url()).origin, aiConfig: { enabled: true, mode: 'form_agent', cliBinary: 'agy' },
    createTransport: () => ({ kill() {}, close() {}, async send(prompt) {
      mappedFields.push(...JSON.parse(prompt.split('\n').at(-1)).fields);
      return { text: '[]' };
    } })
  });
  t.after(() => stopContinuousAgent(page));
  await page.waitForFunction(() => document.querySelector('#address').value === '10 Oak St');
  await page.locator('[role=option]').click();
  await page.waitForTimeout(1600);
  assert.equal(await page.inputValue('#address'), '10 Oak Street, Unit A');
  assert.equal(await page.inputValue('[name=place_id]'), 'test-10');
  assert.equal(await page.locator('#submit').isEnabled(), true);
  assert.equal(await page.locator('form').getAttribute('data-writes'), '1');
  await page.evaluate(() => { document.querySelector('#address').value = ''; });
  await page.waitForTimeout(750);
  assert.equal(await page.inputValue('#address'), '', 'Widget giữ mã đã chọn và dùng ô trống để tìm kiếm mới');
  assert.equal(await page.locator('form').getAttribute('data-writes'), '1');
  await page.evaluate(() => { document.querySelector('[name=place_id]').value = ''; });
  await page.waitForFunction(() => document.querySelector('#address').value === '10 Oak St');
  page._assignedRecord = { address: '99 Pine Rd' };
  await page.waitForFunction(() => document.querySelector('#address').value === '99 Pine Rd');
  assert.ok(agent.turnCount > 0);
  assert.ok(mappedFields.every(item => item.field !== 'address'));
});

test('AI ghép ô ngoài danh sách theo từng phần tử, giữ dữ liệu người dùng và giới hạn công cụ MCP', { timeout: 18000 }, async t => {
  const { operateOnForm } = await import('../src/form-mcp/operate-on-form.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<meta charset="utf-8"><form id="allowed" data-autoleadpc-mcp="record">
    <input id="known" data-autoleadpc-field="firstname">
    <label>Where do you reside?<input></label><label>State abbreviation<input id="manual"></label>
    <label>City<input id="bad" value="123" pattern="[A-Za-z ]+"></label>
    <textarea aria-label="Where do you receive letters?"></textarea>
    <input data-test-unlabelled><input data-autoleadpc-field="" id="ambiguous" aria-label="What else?">
    <input id="wrongsource" aria-label="Số điện thoại" type="tel">
    <input id="filled" aria-label="Prefilled" value="user-entry"><input type="password" aria-label="Password">
    <input type="text" autocomplete="one-time-code" aria-label="Verify">
    <input hidden aria-label="Hidden"><input disabled aria-label="Disabled"><input readonly aria-label="Locked">
    <button type="submit">Submit</button></form>
    <input aria-label="Outside"><form><input aria-label="Other form"></form>`);
  const origin = new URL(page.url()).origin;
  page._assignedRecord = { firstname: 'Ada', state: 'Texas', city: 'Austin', address: '10 Oak St', secret: 'never-send' };
  const batches = [];
  let release, firstSent;
  const firstBatch = new Promise(resolve => { firstSent = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const agent = startContinuousAgent(page, () => page._assignedRecord, session, {
    allowedOrigin: origin, aiConfig: { enabled: true, mode: 'form_agent' },
    createTransport: () => ({ kill: release, close() {}, async send(prompt) {
      const batch = JSON.parse(prompt.split('\n').at(-1));
      batches.push(batch);
      if (batches.length === 1) { firstSent(); await gate; }
      const sources = { '': 'state', 'Where do you reside?': 'state', 'State abbreviation': 'state', City: 'city',
        'Where do you receive letters?': 'address', 'Số điện thoại': 'address', 'What else?': 'secret', 'New town': 'city' };
      return { text: JSON.stringify(batch.fields.map(({field, label}) => ({field, source: sources[label]}))) };
    } })
  });
  t.after(() => { release(); stopContinuousAgent(page); });
  await page.waitForFunction(() => document.querySelector('#known').value === 'Ada');
  await firstBatch;
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].fields.map(item => item.label).sort(), ['', 'Where do you reside?', 'State abbreviation', 'City',
    'Where do you receive letters?', 'What else?', 'Số điện thoại'].sort());
  assert.doesNotMatch(JSON.stringify(batches[0]), /Ada|Austin|Texas|10 Oak St|never-send|user-entry|secret/);
  await page.locator('#manual').fill('typed while waiting');
  await page.locator('#allowed').evaluate(form => form.prepend(form.querySelector('textarea')));
  release();
  await page.waitForFunction(() => document.querySelector('textarea').value === '10 Oak St' && document.querySelector('#bad').value === 'Austin');
  assert.equal(await page.getByLabel('Where do you reside?').inputValue(), 'Texas');
  assert.equal(await page.locator('#manual').inputValue(), 'typed while waiting');
  assert.equal(await page.locator('#filled').inputValue(), 'user-entry');
  assert.equal(await page.locator('#ambiguous').inputValue(), '');
  assert.equal(await page.locator('[data-test-unlabelled]').inputValue(), '');
  assert.equal(await page.locator('#wrongsource').inputValue(), '');
  await page.locator('#allowed').evaluate(form => form.insertAdjacentHTML('afterend', '<input form="allowed" aria-label="New town">'));
  await page.waitForFunction(() => document.querySelector('[aria-label="New town"]').value === 'Austin');
  assert.deepEqual(batches.slice(1).map(batch => batch.fields.map(item => item.label)), [['New town']]);
  const external = await page.locator('#allowed').evaluate(operateOnForm, { origin });
  assert.deepEqual(external.fields.map(item => item.field), ['firstname']);
  const privateKey = batches[0].fields[0].field;
  assert.ok((await page.locator('#allowed').evaluate(operateOnForm, { origin, field: privateKey, value: 'wrong' })).error);
  assert.equal(agent.turnCount, 2);
});
