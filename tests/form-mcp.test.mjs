import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { parseAutofillRecords } from '../src/autofill/parse-autofill-records.mjs';
import { handleFormMcpRequest } from '../src/form-mcp/handle-form-request.mjs';
import { screenRouteHandlers } from '../src/http/routes/screen-handlers.mjs';
import { issuePairing, consumePairing } from '../src/form-mcp/pairing.mjs';

test('mã ghép chỉ dùng một lần và origin phải chính xác', () => {
  assert.throws(() => issuePairing('http://forms.example.test'));
  assert.throws(() => issuePairing('https://forms.example.test/path'));
  const pair = issuePairing('https://forms.example.test');
  assert.equal(consumePairing(pair.code).token, pair.token);
  assert.throws(() => consumePairing(pair.code));
  assert.throws(() => consumePairing('../state'));
});

test('stdio ghép đúng tab, chỉ điền đáp án của record và thu hồi quyền', { timeout: 30000, skip: !existsSync(chromium.executablePath()) }, async t => {
  assert.ok(screenRouteHandlers.includes(handleFormMcpRequest));
  const operatorHtml = readFileSync(new URL('../ui/desktop/index.html', import.meta.url), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const operatorAction = readFileSync(new URL('../ui/desktop/functions/update-screen-form-mcp.js', import.meta.url), 'utf8');
  const server = createServer(async (req, res) => {
    if (await handleFormMcpRequest(req, res)) return;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (req.url === '/operator') { res.end(operatorHtml); return; }
    res.end(`<form data-autoleadpc-mcp="record" onsubmit="event.preventDefault();this.dataset.sent=1">
      <label>ZIP<input type="tel" data-autoleadpc-field="zipcode"></label>
      <label>Email<input type="email" data-autoleadpc-field="email"></label>
      <label>State<select data-autoleadpc-field="state"><option value="">Choose</option><option value="area-48">TX</option></select></label>
      <fieldset><legend>Contact</legend><label><input type="radio" name="contact" data-autoleadpc-field="contact" value="mail">Mail</label>
      <label><input type="radio" name="contact" data-autoleadpc-field="contact" value="sms">SMS</label></fieldset>
      <input data-autoleadpc-field="nickname"><input type="password" data-autoleadpc-field="secret"><button>Gửi</button></form>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(origin);
  [page._assignedRecord] = parseAutofillRecords('zipcode,state,contact,mcp_answer_contact,secret\n01234,Texas,sms,mail,fixture-secret');
  const session = { slot: 17, assignedEmail: 'tab@example.invalid', mainPage: page, browser: page.context() };
  activeBrowsers.add(session);
  t.after(() => activeBrowsers.delete(session));
  const child = spawn(process.execPath, ['mcp-server.mjs', '--forms'], {
    env: { ...process.env, AUTOLEADPC_PORT: String(server.address().port) }, stdio: ['pipe','pipe','ignore']
  });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const exited = once(child, 'exit');
  t.after(async () => { child.stdin.end(); await exited; });
  let id = 0;
  /**
   * Gửi một request từ client stdio thử nghiệm và đọc phản hồi cùng id.
   * @param {string} method Phương thức MCP.
   * @param {object} params Tham số của request.
   * @return {Promise<object>} Phản hồi JSON-RPC.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  async function rpc(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
    const reply = JSON.parse((await lines.next()).value);
    assert.equal(reply.id, id);
    return reply;
  }
  const call = (name, args = {}) => rpc('tools/call', { name, arguments: args });
  const uiPost = (path, code, requestOrigin = origin) => fetch(origin + path, { method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  assert.equal((await rpc('initialize', { protocolVersion: '2025-11-25' })).result.serverInfo.name, 'autoleadpc-forms');
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  assert.deepEqual((await rpc('tools/list', {})).result.tools.map(tool => tool.name), ['form_pair','form_inspect','form_fill','form_disconnect']);
  assert.equal((await call('app_run')).error.code, -32602);
  const pair = JSON.parse((await call('form_pair', { origin })).result.content[0].text);
  assert.ok(pair.code); assert.equal(pair.token, undefined);
  assert.equal((await call('form_inspect')).result.isError, true);
  assert.equal((await uiPost('/form-mcp/share/17', pair.code, 'https://elsewhere.test')).status, 403);
  const operator = await browser.newPage();
  await operator.goto(origin + '/operator');
  await operator.addScriptTag({ content: 'var _screenActiveSlot=17;' + operatorAction });
  await operator.locator('#screenModal').evaluate(modal => { modal.style.display = 'flex'; });
  await operator.getByRole('button', { name: 'MCP biểu mẫu', exact: true }).click();
  await operator.getByLabel('Mã từ agent').fill(pair.code);
  await operator.getByRole('button', { name: 'Ghép tab này', exact: true }).click();
  await operator.waitForFunction(() => document.querySelector('#screenMcpPanel output').value.startsWith('Đã ghép'));

  assert.equal((await uiPost('/form-mcp/share/17', pair.code)).status, 409);
  const inspected = (await call('form_inspect')).result.content[0].text;
  assert.doesNotMatch(inspected, /01234|fixture-secret|Texas/);
  assert.deepEqual(JSON.parse(inspected).fields.map(f => [f.field, f.available]),
    [['zipcode',true],['email',true],['state',true],['contact',true],['nickname',false]]);
  assert.equal((await call('form_fill', { field: 'zipcode', value: '99999' })).result.isError, true);
  assert.equal((await call('form_fill', { field: 'nickname' })).result.isError, true);
  assert.equal((await call('form_fill', { field: 'secret' })).result.isError, true);
  for (const field of ['zipcode','email','state','contact']) assert.equal((await call('form_fill', { field })).result.isError, false);
  assert.equal(await page.locator('input[type=tel]').inputValue(), '01234');
  assert.equal(await page.locator('input[type=email]').inputValue(), session.assignedEmail);
  assert.equal(await page.locator('select').inputValue(), 'area-48');
  assert.equal(await page.locator('input[value=sms]').isChecked(), true);
  assert.equal(await page.locator('form').getAttribute('data-sent'), null);
  await page.locator('select').evaluate(select => {
    select.selectedIndex = 0;
    select.addEventListener('change', () => setTimeout(() => { select.selectedIndex = 0; }, 400), { once: true });
  });
  const reverted = (await call('form_fill', { field: 'state' })).result;
  assert.equal(reverted.isError, true);
  assert.equal(JSON.parse(reverted.content[0].text).verified, false);
  assert.equal(await page.locator('select').inputValue(), '');
  await page.reload();
  assert.equal((await call('form_fill', { field: 'zipcode' })).result.isError, true);
  assert.equal(await page.locator('input[type=tel]').inputValue(), '');
  assert.equal((await call('form_disconnect')).result.isError, false);
  const second = JSON.parse((await call('form_pair', { origin })).result.content[0].text);
  assert.equal((await uiPost('/form-mcp/share/17', second.code)).status, 200);
  page._assignedRecord = { zipcode: '77777' };
  assert.equal((await call('form_fill', { field: 'zipcode' })).result.isError, true);
  assert.equal(await page.locator('input[type=tel]').inputValue(), '');
  await call('form_disconnect');
  const third = JSON.parse((await call('form_pair', { origin })).result.content[0].text);
  assert.equal((await uiPost('/form-mcp/share/17', third.code)).status, 200);
  await operator.getByRole('button', { name: 'Ngắt ghép tab này' }).click();
  await operator.waitForFunction(() => document.querySelector('#screenMcpPanel output').value === 'Đã ngắt ghép.');
  assert.equal((await call('form_inspect')).result.isError, true);
});

test('Obscura điền từ đúng record qua backend thật và giữ nguyên khi option không khớp', { timeout: 30000 }, async t => {
  try { resolveObscuraBinary(); } catch { t.skip('Chưa có binary Obscura'); return; }
  const server = createServer(async (req, res) => {
    if (await handleFormMcpRequest(req, res)) return;
    res.setHeader('Content-Type', 'text/html');
    res.end('<form data-autoleadpc-mcp="record"><input type="tel" data-autoleadpc-field="zipcode"><select data-autoleadpc-field="state"><option value="">Choose</option><option value="TX">Texas</option></select><select multiple data-autoleadpc-field="channels"><option selected>A</option><option>B</option><option>C</option></select><input id="street" role="combobox" aria-controls="menu" data-autoleadpc-field="address"><div id="menu" role="listbox"><button type="button" role="option">10 Oak St</button></div><input name="place_id" type="hidden"></form>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const session = await openObscuraBrowser({ port: 0, slot: 995, registerSession: false });
  t.after(() => session.close());
  await session.page.goto(origin);
  session.page._assignedRecord = { address: '10 Oak St', zipcode: '01234', state: 'missing', mcpanswerchannels: '["B","C"]' };
  activeBrowsers.add(session); t.after(() => activeBrowsers.delete(session));
  const pair = issuePairing(origin);
  const share = await fetch(origin + '/form-mcp/share/995', { method: 'POST', headers: { Origin: origin },
    body: JSON.stringify({ code: pair.code }) });
  assert.equal(share.status, 200);
  const call = (action, args) => fetch(origin + '/form-mcp/' + action, { method: 'POST',
    headers: { Authorization: 'Bearer ' + pair.token }, body: JSON.stringify(args) });
  assert.equal((await call('fill', { field: 'state' })).status, 409);
  assert.equal(await session.page.locator('select:not([multiple])').inputValue(), '');
  assert.equal((await call('fill', { field: 'zipcode' })).status, 200);
  assert.equal(await session.page.locator('input[type=tel]').inputValue(), '01234');
  session.page._assignedRecord.state = 'Texas';
  assert.equal((await call('fill', { field: 'state' })).status, 200);
  assert.equal(await session.page.locator('select:not([multiple])').inputValue(), 'TX');
  const inspected = await (await call('inspect', {})).json();
  assert.equal(inspected.fields.find(item => item.field === 'channels').kind, 'select-multiple');
  assert.equal((await call('fill', { field: 'channels' })).status, 200);
  assert.deepEqual(await session.page.evaluate(() => Array.from(document.querySelector('select[multiple]').options, option => option.selected)), [false,true,true]);
  await session.page.evaluate(() => {
    const street = document.querySelector('#street'), place = document.querySelector('[name=place_id]');
    street.addEventListener('input', () => { place.value = ''; });
    document.querySelector('[role=option]').addEventListener('click', () => { street.value = '10 Oak Street, Unit A'; place.value = 'local-10'; });
  });
  assert.equal((await call('fill', { field: 'address' })).status, 200);
  await session.page.evaluate(() => document.querySelector('[role=option]').click());
  assert.equal((await call('fill', { field: 'address' })).status, 200);
  assert.equal(await session.page.locator('#street').inputValue(), '10 Oak Street, Unit A');
  assert.equal(await session.page.locator('[name=place_id]').inputValue(), 'local-10');
  await call('disconnect', {});
});
