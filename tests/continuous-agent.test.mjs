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
