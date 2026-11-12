import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stampLogSeq } from '../src/logging/browser-logs/stamp-log-seq.mjs';
import { selectBrowserLogsDelta } from '../src/logging/browser-logs/select-browser-logs-delta.mjs';
import { moduleState } from '../src/logging/browser-logs/state/module-state.mjs';
import { setPersistedBrowserLogs } from '../src/logging/browser-logs/state/persisted-browser-logs.mjs';
import { handleGetBrowserLogs } from '../src/http/routes/browser/get-logs.mjs';

// Tab Log tải 5 MB mỗi 2 giây (đo 2026-11-13): thay bằng tải phần mới theo số thứ tự toàn cục.
const entry = (id, seq, type = 'navigate') => ({ id, seq, type });
const sessions = () => [
  { id: 'B', slot: 2, logs: [entry('b1', 3)] },
  { id: 'A', slot: 1, logs: [entry('a1', 1), entry('a2', 2), entry('a3', 4, 'browser_action')] },
];

test('stampLogSeq: gán số thứ tự tăng dần, kể cả sự kiện gộp được cập nhật lại', () => {
  const first = stampLogSeq({ id: 'x' });
  const second = stampLogSeq({ id: 'y' });
  assert.ok(second.seq === first.seq + 1);
  assert.ok(stampLogSeq(first).seq > second.seq, 'sự kiện gộp (tăng repeatCount) nhận seq mới để client thấy thay đổi');
});

test('selectBrowserLogsDelta: chỉ phiên có sự kiện mới, kèm danh sách id để client bỏ phiên đã xóa', () => {
  const delta = selectBrowserLogsDelta(sessions(), 2);
  assert.deepEqual(delta.ids, ['B', 'A']);
  assert.deepEqual(delta.sessions.map(s => [s.id, s.slot, s.logs.map(e => e.id)]), [['B', 2, ['b1']], ['A', 1, ['a3']]]);
  assert.deepEqual(selectBrowserLogsDelta(sessions(), 4).sessions, []);
  assert.equal(selectBrowserLogsDelta(sessions(), 0).sessions[1].logs.length, 3, 'since=0 trả đủ');
});

test('GET /browser-logs: không since → đủ; since hợp lệ → phần mới; epoch khác hoặc since vượt → đủ', async () => {
  setPersistedBrowserLogs(sessions());
  moduleState.logSeq = 4;
  const call = async url => {
    const out = {};
    const response = { writeHead: (status, headers) => Object.assign(out, { status, headers }), end: body => { out.body = JSON.parse(body); } };
    assert.equal(await handleGetBrowserLogs({ method: 'GET', url }, response), true);
    return out.body;
  };
  const full = await call('/browser-logs');
  assert.equal(full.seq, 4);
  assert.equal(full.epoch, moduleState.logEpoch);
  assert.equal(full.since, undefined);
  assert.equal(full.sessions.length, 2);
  assert.equal(full.sessions[1].logs.length, 3);
  const delta = await call(`/browser-logs?since=2&epoch=${moduleState.logEpoch}`);
  assert.equal(delta.since, 2);
  assert.deepEqual(delta.ids, ['B', 'A']);
  assert.deepEqual(delta.sessions.map(s => s.logs.map(e => e.id)), [['b1'], ['a3']]);
  const idle = await call(`/browser-logs?since=4&epoch=${moduleState.logEpoch}`);
  assert.deepEqual(idle.sessions, []);
  assert.ok(JSON.stringify(idle).length < 300, 'không có gì mới thì phản hồi rất nhỏ');
  assert.equal((await call('/browser-logs?since=2&epoch=1')).since, undefined, 'app khởi động lại → tải đủ');
  assert.equal((await call(`/browser-logs?since=99&epoch=${moduleState.logEpoch}`)).since, undefined);
  assert.equal(await handleGetBrowserLogs({ method: 'GET', url: '/browser-logs/clear' }, {}), false, 'không nuốt route con');
  setPersistedBrowserLogs([]);
});

test('UI mergeLogDelta: nối sự kiện mới, thay sự kiện gộp cùng id, thêm phiên mới lên đầu, bỏ phiên đã xóa', () => {
  const context = {};
  vm.runInNewContext(readFileSync(new URL('../ui/desktop/functions/merge-log-delta.js', import.meta.url), 'utf8') + '\nthis.mergeLogDelta = mergeLogDelta;', context);
  const current = [{ id: 'A', slot: 1, ip: null, logs: [entry('a1', 1), entry('a2', 2)] }, { id: 'OLD', logs: [] }];
  const result = context.mergeLogDelta(current, { since: 2, ids: ['N', 'A'], sessions: [
    { id: 'N', slot: 3, logs: [entry('n1', 5)] },
    { id: 'A', slot: 1, ip: '1.2.3.4', logs: [{ ...entry('a2', 6), repeatCount: 2 }, entry('a3', 7)] },
  ] });
  assert.equal(result.changed, true);
  assert.deepEqual(result.logData.map(s => s.id), ['N', 'A']);
  const a = result.logData.find(s => s.id === 'A');
  assert.equal(a.ip, '1.2.3.4', 'metadata phiên được cập nhật');
  assert.deepEqual(a.logs.map(e => [e.id, e.repeatCount || 1]), [['a1', 1], ['a2', 2], ['a3', 1]]);
  assert.equal(context.mergeLogDelta(result.logData, { since: 7, ids: ['N', 'A'], sessions: [] }).changed, false);
  assert.equal(context.mergeLogDelta(result.logData, { sessions: [{ id: 'Z', logs: [] }] }).logData[0].id, 'Z', 'phản hồi đủ (không since) thay toàn bộ');
});
