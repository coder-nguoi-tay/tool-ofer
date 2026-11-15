import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiChatSession, resolveApiUrl, resolveChatUrl } from '../src/continuous-agent/api-chat-session.mjs';
import { loadAgentConfig, saveAgentConfig, maskAgentConfig } from '../src/continuous-agent/agent-config.mjs';
import { startContinuousAgent, stopContinuousAgent } from '../src/continuous-agent/index.mjs';
import { handleAgentApiConfig } from '../src/continuous-agent/http/handle-agent-api-config.mjs';

const ok = content => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 3 } }), text: async () => '' });

test('resolveChatUrl: nhận base hoặc URL đầy đủ, chỉ https (http cho localhost), bỏ credential trong URL', () => {
  assert.equal(resolveChatUrl('https://api.example.test/v1'), 'https://api.example.test/v1/chat/completions');
  assert.equal(resolveChatUrl('https://api.example.test/v1/'), 'https://api.example.test/v1/chat/completions');
  assert.equal(resolveChatUrl('https://api.example.test/v1/chat/completions'), 'https://api.example.test/v1/chat/completions');
  assert.equal(resolveChatUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1/chat/completions');
  assert.equal(resolveChatUrl('https://u:p@api.example.test'), 'https://api.example.test/chat/completions');
  assert.throws(() => resolveChatUrl('http://api.example.test/v1'), /https/);
  assert.throws(() => resolveChatUrl('not a url'), /không hợp lệ/);
  assert.throws(() => resolveChatUrl('file:///etc/passwd'), /https/);
});

test('api session: gửi Bearer + model, giữ lượt đầu và chỉ keepTurns lượt gần nhất, lỗi không nhân đôi lượt', async () => {
  const calls = [];
  let fail = false;
  const fetchFn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return fail ? { ok: false, status: 429, text: async () => 'quota; key=sk-secret-123' } : ok(`r${calls.length}`); };
  const session = createApiChatSession({ baseUrl: 'https://api.example.test/v1', apiKey: 'sk-secret-123', model: 'm1', keepTurns: 2, fetchFn });
  for (let index = 1; index <= 5; index++) await session.send(`u${index}`);
  assert.equal(calls[0].url, 'https://api.example.test/v1/chat/completions');
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-secret-123');
  assert.equal(calls[0].body.model, 'm1');
  const last = calls[4].body.messages.map(message => message.content);
  assert.deepEqual(last, ['u1', 'r3', 'u4', 'r4', 'u5'], 'lượt đầu + đuôi 4 message; u2/r2 và u3 đã bị bỏ');
  assert.equal(session.turns, 5);

  fail = true;
  await assert.rejects(session.send('boom'), error => /API 429/.test(error.message) && !error.message.includes('sk-secret-123'));
  fail = false;
  await session.send('again');
  const roles = calls.at(-1).body.messages.map(message => message.role);
  assert.deepEqual(roles.filter((role, i) => i > 0 && role === roles[i - 1]), [], 'luôn xen kẽ user/assistant, không có lượt lỗi nhân đôi');
  session.close();
  assert.equal(session.turns, 0);
});

test('api session: timeout hủy request, phản hồi sai định dạng và thiếu cấu hình đều báo lỗi rõ', async () => {
  const hang = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const slow = createApiChatSession({ baseUrl: 'https://a.test', apiKey: 'k', model: 'm', timeoutMs: 20, fetchFn: hang });
  await assert.rejects(slow.send('x'), /API timeout/);
  const bad = createApiChatSession({ baseUrl: 'https://a.test', apiKey: 'k', model: 'm', fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  await assert.rejects(bad.send('x'), /không hợp lệ/);
  const pending = createApiChatSession({ baseUrl: 'https://a.test', apiKey: 'k', model: 'm', fetchFn: hang });
  const inflight = pending.send('x');
  await assert.rejects(pending.send('y'), /turn_in_flight/);
  pending.kill();
  await assert.rejects(inflight, /api_closed/);
  assert.throws(() => createApiChatSession({ baseUrl: 'https://a.test', model: 'm' }), /key/);
  assert.throws(() => createApiChatSession({ baseUrl: 'https://a.test', apiKey: 'k' }), /model/);
});

test('agent config: lưu từng phần, giữ key cũ khi gửi rỗng, chmod 600, che key, env ghi đè', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'agent-cfg-')), 'Config', 'agent-config.json');
  saveAgentConfig({ transport: 'api', apiBaseUrl: ' https://a.test/v1 ', apiModel: 'm', apiKey: 'sk-abcdef1234' }, file);
  saveAgentConfig({ apiModel: 'm2', apiKey: '' }, file);
  const loaded = loadAgentConfig(file, {});
  assert.deepEqual({ ...loaded }, { transport: 'api', apiFormat: 'openai', apiBaseUrl: 'https://a.test/v1', apiModel: 'm2', apiKey: 'sk-abcdef1234' });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const masked = maskAgentConfig(loaded);
  assert.equal(masked.apiKeySet, true);
  assert.equal(masked.apiKeyHint, '…1234');
  assert.ok(!JSON.stringify(masked).includes('sk-abcdef'));
  assert.equal(loadAgentConfig(file, { AUTOLEAD_AGENT_API_KEY: 'env-key' }).apiKey, 'env-key');
  assert.throws(() => saveAgentConfig({ transport: 'x' }, file), /transport/);
  saveAgentConfig({ clearApiKey: true }, file);
  assert.equal(loadAgentConfig(file, {}).apiKey, '');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).transport, 'api');
  assert.equal(loadAgentConfig(join(tmpdir(), 'khong-ton-tai.json'), {}).transport, 'agy');
});

test('start: transport api thiếu cấu hình thì báo log và không chạy, không đổi sang agy', () => {
  const page = { isClosed: () => false, once() {} };
  const logs = [];
  const result = startContinuousAgent(page, () => ({}), { addLog: entry => logs.push(entry) }, { aiConfig: { enabled: true, mode: 'continuous' }, agentConfig: { transport: 'api', apiBaseUrl: '', apiKey: '', apiModel: '' } });
  assert.equal(result, null);
  assert.equal(logs[0].type, 'continuous_config_invalid');
  assert.equal(page._continuousAgent, undefined);
});

test('route /agent/api/config: GET che key, POST chỉ từ loopback, URL sai bị từ chối', async () => {
  const run = async (method, url, body, remoteAddress = '127.0.0.1') => {
    const request = Object.assign((async function* () { if (body !== undefined) yield JSON.stringify(body); })(), { method, url, socket: { remoteAddress }, setEncoding() {}, on() {} });
    request.on = (event, handler) => { if (event === 'data') setImmediate(() => { if (body !== undefined) handler(JSON.stringify(body)); }); if (event === 'end') setTimeout(handler, 5); };
    let out = { status: 0, body: '' };
    const response = { writeHead: status => { out.status = status; }, end: text => { out.body = text; }, setHeader() {} };
    const handled = await handleAgentApiConfig(request, response);
    return { handled, ...out };
  };
  assert.equal((await run('GET', '/other')).handled, false);
  const remote = await run('POST', '/agent/api/config', { apiKey: 'sk-evil' }, '192.168.1.9');
  assert.equal(remote.status, 403);
  const badUrl = await run('POST', '/agent/api/config', { apiBaseUrl: 'http://evil.example/v1' });
  assert.equal(badUrl.status, 400);
  const got = await run('GET', '/agent/api/config');
  assert.equal(got.status, 200);
  assert.ok(!/"apiKey"\s*:/.test(got.body), 'GET không có trường apiKey');
});

test('agent chạy end-to-end qua API OpenAI-compatible (server giả localhost): điền từ record, key đi bằng Bearer', async t => {
  const { createServer } = await import('node:http');
  const { chromium } = await import('playwright');
  const { createFormScopeFixture } = await import('./helpers/form-scope-browser-fixture.mjs');
  const requests = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push({ url: request.url, auth: request.headers.authorization, body: JSON.parse(body) });
      const content = requests.length === 1 ? '```json\n[{"action":"fill","selector":"#email","value":"ai-bia@x.test"}]\n```' : '[]';
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, '<input name="email" id="email" type="email">');
  t.after(() => context.close());
  session.triggerAutofillScan = () => {};
  const agent = startContinuousAgent(page, () => ({ email: 'dung@record.test' }), session, {
    aiConfig: { enabled: true, mode: 'continuous' },
    agentConfig: { transport: 'api', apiBaseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'sk-test-key-0001', apiModel: 'fake-model' },
  });
  assert.ok(agent);
  const end = Date.now() + 15000;
  while (Date.now() < end && (await page.inputValue('#email')) !== 'dung@record.test') await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await page.inputValue('#email'), 'dung@record.test');
  assert.equal(requests[0].url, '/v1/chat/completions');
  assert.equal(requests[0].auth, 'Bearer sk-test-key-0001');
  assert.equal(requests[0].body.model, 'fake-model');
  assert.ok(requests[0].body.messages[0].content.includes('dung@record.test'));
  stopContinuousAgent(page);
  await agent.done;
});

test('resolveApiUrl: Anthropic và Gemini — base, có /v1, hoặc endpoint đầy đủ của gateway tùy chỉnh', () => {
  assert.equal(resolveApiUrl('https://api.anthropic.com', 'anthropic'), 'https://api.anthropic.com/v1/messages');
  assert.equal(resolveApiUrl('https://gw.example.test/anthropic/v1', 'anthropic'), 'https://gw.example.test/anthropic/v1/messages');
  assert.equal(resolveApiUrl('https://gw.example.test/custom/messages', 'anthropic'), 'https://gw.example.test/custom/messages');
  assert.equal(resolveApiUrl('https://generativelanguage.googleapis.com', 'gemini', 'gemini-2.0-flash'), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent');
  assert.equal(resolveApiUrl('https://gw.example.test/v1beta', 'gemini', 'm'), 'https://gw.example.test/v1beta/models/m:generateContent');
  assert.equal(resolveApiUrl('https://gw.example.test/x/models/m:generateContent', 'gemini'), 'https://gw.example.test/x/models/m:generateContent');
  assert.throws(() => resolveApiUrl('https://x.test', 'gemini'), /model/);
  assert.throws(() => resolveApiUrl('https://x.test', 'cohere'), /apiFormat/);
});

test('api session Anthropic: x-api-key + version, max_tokens, đọc content[].text; không có system/role lạ', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], usage: { input_tokens: 5 } }) }; };
  const session = createApiChatSession({ format: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-12345678', model: 'claude-x', keepTurns: 1, fetchFn });
  assert.equal((await session.send('u1')).text, 'ab');
  await session.send('u2'); await session.send('u3');
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].init.headers['x-api-key'], 'sk-ant-12345678');
  assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.equal(calls[0].body.max_tokens, 4096);
  const roles = calls[2].body.messages.map(message => message.role);
  assert.deepEqual(roles, ['user', 'assistant', 'user'], 'xen kẽ, bắt đầu bằng user');
});

test('api session Gemini: x-goog-api-key, role model/user, đọc candidates parts; lỗi HTTP không lộ key', async () => {
  const calls = [];
  let fail = false;
  const fetchFn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return fail ? { ok: false, status: 403, text: async () => 'bad key AIza-secret-key-9999' } : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }, { text: 'y' }] } }], usageMetadata: { totalTokenCount: 4 } }) }; };
  const session = createApiChatSession({ format: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'AIza-secret-key-9999', model: 'gemini-2.0-flash', keepTurns: 1, fetchFn });
  assert.equal((await session.send('u1')).text, 'xy');
  await session.send('u2');
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'AIza-secret-key-9999');
  assert.ok(!calls[0].url.includes('AIza'), 'key không nằm trong URL');
  assert.deepEqual(calls[1].body.contents.map(content => content.role), ['user', 'model', 'user']);
  fail = true;
  await assert.rejects(session.send('u3'), error => /API 403/.test(error.message) && !error.message.includes('AIza-secret'));
});

test('api session: phản hồi thiếu text ở bất kỳ giao thức nào đều báo lỗi rõ', async () => {
  for (const format of ['openai', 'anthropic', 'gemini']) {
    const session = createApiChatSession({ format, baseUrl: 'https://a.test', apiKey: 'k', model: 'm', fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
    await assert.rejects(session.send('x'), new RegExp(`API \\(${format}\\)`));
  }
});

test('agent config: apiFormat hợp lệ, mặc định openai, route kiểm URL theo format+model', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'agent-cfg-')), 'c.json');
  assert.equal(loadAgentConfig(file, {}).apiFormat, 'openai');
  saveAgentConfig({ apiFormat: 'anthropic' }, file);
  assert.equal(loadAgentConfig(file, {}).apiFormat, 'anthropic');
  assert.equal(loadAgentConfig(file, { AUTOLEAD_AGENT_API_FORMAT: 'gemini' }).apiFormat, 'gemini');
  assert.throws(() => saveAgentConfig({ apiFormat: 'cohere' }, file), /apiFormat/);
  assert.equal(maskAgentConfig(loadAgentConfig(file, {})).apiFormat, 'anthropic');
});
