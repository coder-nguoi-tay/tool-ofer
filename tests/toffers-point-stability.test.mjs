import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshToffersOverview } from '../src/leads/toffers-overview/refresh-toffers-overview.mjs';
import { latestToffersOverview } from '../src/leads/toffers-overview/state/latest-toffers-overview.mjs';

test('point Toffers: API point lỗi lẻ không ghi đè point bằng null, không log "Cập nhật" lặp', async t => {
  let pointOk = true;
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('get_current_point')) return pointOk ? new Response(JSON.stringify({ point: 103 })) : new Response('busy', { status: 500 });
    return new Response(JSON.stringify({ results: [{ ip: '203.0.113.5' }] }));
  });
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));

  await refreshToffersOverview();
  assert.equal(latestToffersOverview.point, 103);
  for (const ok of [false, true, false, true]) {
    pointOk = ok;
    await refreshToffersOverview();
    assert.equal(latestToffersOverview.point, 103, `point phải giữ 103 khi API point ${ok ? 'ổn' : 'lỗi'}`);
  }
  assert.equal(latestToffersOverview.results.length, 1);
  assert.ok(logs.filter(line => line.includes('Cập nhật')).length <= 1, logs.join('\n'));
});

test('lead Toffers: API lead lỗi lẻ (point vẫn trả) không xóa danh sách lead đang có', async t => {
  let leadsOk = true;
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('get_current_point')) return new Response(JSON.stringify({ point: 103 }));
    return leadsOk ? new Response(JSON.stringify({ results: [{ ip: '203.0.113.6' }, { ip: '203.0.113.7' }] })) : new Response('busy', { status: 500 });
  });
  t.mock.method(console, 'log', () => {});
  await refreshToffersOverview();
  assert.equal(latestToffersOverview.results.length, 2);
  leadsOk = false;
  await refreshToffersOverview();
  assert.equal(latestToffersOverview.results.length, 2, 'không được ghi đè lead bằng mảng rỗng khi API lead lỗi');
});
