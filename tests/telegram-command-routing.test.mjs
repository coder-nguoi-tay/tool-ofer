import assert from 'node:assert/strict';
import test from 'node:test';
import { execCommand } from "../src/tgbot/exec-command.mjs";
import { moduleState } from "../src/tgbot/state/module-state.mjs";

test('Telegram: người gửi không được phép không gọi API hoặc đổi chat nhận thông báo', async (t) => {
  const previous = { ...moduleState };
  t.after(() => Object.assign(moduleState, previous));
  moduleState.cfg = { allowedUserId: 42, botToken: 'fixture-token' };
  moduleState.notifyChatId = null;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected request'); });
  await execCommand(100, 99, '/email');
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(moduleState.notifyChatId, null);
});

test('Telegram: lệnh email và alias đi qua cùng handler, mỗi lần chỉ gửi một phản hồi', async (t) => {
  const previous = { ...moduleState };
  t.after(() => Object.assign(moduleState, previous));
  moduleState.cfg = { allowedUserId: 42, botToken: 'fixture-token' };
  moduleState.notifyChatId = null;
  const replies = [];
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push(url);
    if (url.includes('api.telegram.org')) {
      replies.push(JSON.parse(options.body));
      return { json: async () => ({ ok: true, result: {} }) };
    }
    assert.ok(url.endsWith('/email-queue'));
    return { json: async () => ({ available: 3, used: 2 }) };
  });
  await execCommand(100, 42, '/email');
  await execCommand(100, 42, 'EMAIL');
  await execCommand(100, 42, 'email xem');
  assert.equal(moduleState.notifyChatId, 100);
  assert.equal(requests.length, 6);
  assert.equal(replies.length, 3);
  assert.deepEqual(replies[0], replies[1]);
  assert.deepEqual(replies[0], replies[2]);
  assert.equal(replies[0].chat_id, 100);
  assert.match(replies[0].text, /3/);
});
