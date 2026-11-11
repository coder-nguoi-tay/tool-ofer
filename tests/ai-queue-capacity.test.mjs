import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForAiCapacity } from '../src/ai-assist/wait-for-ai-capacity.mjs';
import { moduleState } from '../src/ai-assist/state/module-state.mjs';
import { MAX_CONCURRENT_AGT } from '../src/ai-assist/state/max-concurrent-agt.mjs';

test('hàng đợi AI không vượt giới hạn, không giữ tab chờ vô hạn và bỏ trạng thái cũ', async t => {
  const previousCount = moduleState.agtRunningCount;
  t.after(() => { moduleState.agtRunningCount = previousCount; });
  const unavailablePage = { isClosed: () => false, evaluate: async () => { throw new Error('unavailable'); } };
  moduleState.agtRunningCount = MAX_CONCURRENT_AGT - 1;
  const outcomes = await Promise.all([waitForAiCapacity(unavailablePage, {}, 'old', 15), waitForAiCapacity(unavailablePage, {}, 'old', 15)]);
  assert.deepEqual(outcomes, ['acquired', 'queue_timeout']);
  assert.equal(moduleState.agtRunningCount, MAX_CONCURRENT_AGT);
  const changedPage = { isClosed: () => false, evaluate: async () => ({ controls: [], questions: [], errors: [] }) };
  assert.equal(await waitForAiCapacity(changedPage, {}, 'old', 500), 'page_changed');
  assert.equal(moduleState.agtRunningCount, MAX_CONCURRENT_AGT);
  assert.equal(await waitForAiCapacity({ isClosed: () => true }, {}, 'old'), 'closed');
});

test('IP có lead được chọn trước yêu cầu thường đang đợi, kể cả vừa nhận lead trong hàng', async t => {
  const previousCount = moduleState.agtRunningCount;
  t.after(() => { moduleState.agtRunningCount = previousCount; moduleState.agtWaiters.length = 0; });
  moduleState.agtRunningCount = MAX_CONCURRENT_AGT;
  const page = () => ({ isClosed: () => false, evaluate: async () => { throw new Error('fixture unavailable'); } });
  const order = [], messages = [];
  const normal = waitForAiCapacity(page(), {}, 'state', 2000).then(result => { assert.equal(result, 'acquired'); order.push('normal'); moduleState.agtRunningCount--; });
  const promoted = { exitIp: '192.0.2.40' };
  const lead = waitForAiCapacity(page(), promoted, 'state', 2000, message => messages.push(message)).then(result => { assert.equal(result, 'acquired'); order.push('lead'); moduleState.agtRunningCount--; });
  promoted.confirmedLeadIp = promoted.exitIp;
  await new Promise(resolve => setTimeout(resolve, 300));
  moduleState.agtRunningCount--;
  await Promise.all([normal, lead]);
  assert.deepEqual(order, ['lead', 'normal']);
  assert.ok(messages.some(message => message.priority));
  assert.equal(moduleState.agtWaiters.length, 0);
});

test('cùng mức ưu tiên lấy lượt FIFO; yêu cầu đóng không giữ đầu hàng', async t => {
  const previousCount = moduleState.agtRunningCount;
  t.after(() => { moduleState.agtRunningCount = previousCount; moduleState.agtWaiters.length = 0; });
  moduleState.agtRunningCount = MAX_CONCURRENT_AGT;
  const page = { isClosed: () => false, evaluate: async () => { throw new Error('fixture unavailable'); } };
  const closed = {};
  const cancelled = waitForAiCapacity(page, closed, 'state', 1000);
  closed.isClosed = true;
  const order = [];
  const run = number => waitForAiCapacity(page, {}, 'state', 2000).then(result => { assert.equal(result, 'acquired'); order.push(number); moduleState.agtRunningCount--; });
  const first = run(1), second = run(2);
  moduleState.agtRunningCount--;
  await Promise.all([first, second]);
  assert.equal(await cancelled, 'closed');
  assert.deepEqual(order, [1, 2]);
  assert.equal(moduleState.agtWaiters.length, 0);
});
