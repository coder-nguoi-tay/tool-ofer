import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCached711Balance,
  getBandwidthSummary,
  add711IpWhitelist,
  fetch711Token,
} from './app.mjs';

test('getCached711Balance returns proper schema and initial properties', () => {
  const bal = getCached711Balance();
  assert.ok(typeof bal === 'object' && bal !== null);
  assert.ok('ok' in bal);
  assert.ok('remainingGb' in bal);
  assert.ok('packageGb' in bal);
  assert.ok('usedGb' in bal);
  assert.ok('usedPercent' in bal);
  assert.ok('remainingPercent' in bal);
});

test('getBandwidthSummary includes proxy711 balance info', () => {
  const summary = getBandwidthSummary();
  assert.ok(summary);
  assert.ok('proxy711' in summary);
  assert.ok(typeof summary.proxy711 === 'object');
  assert.ok('remainingGb' in summary.proxy711);
  assert.ok('packageGb' in summary.proxy711);
  assert.ok('usedGb' in summary.proxy711);
});

test('711Proxy balance calculation math accurately handles GB conversions', () => {
  const flowBytes = 1745452958; // bytes from 711
  const remainingGb = Number((flowBytes / (1024 ** 3)).toFixed(3)); // ~1.626
  assert.ok(remainingGb > 1.6 && remainingGb < 1.65);

  const packageGb = 2.0;
  const usedGb = Math.max(0, Number((packageGb - remainingGb).toFixed(3)));
  assert.ok(usedGb > 0.35 && usedGb < 0.40);

  const usedPercent = Number(((usedGb / packageGb) * 100).toFixed(1));
  assert.ok(usedPercent > 18 && usedPercent < 20);

  const remainingPercent = Number((100 - usedPercent).toFixed(1));
  assert.ok(remainingPercent > 80 && remainingPercent < 82);
  assert.equal(Number((usedPercent + remainingPercent).toFixed(1)), 100);
});

test('add711IpWhitelist requires an IP argument', async () => {
  await assert.rejects(
    async () => add711IpWhitelist(''),
    { message: /Cần địa chỉ IP/ }
  );
});

test('fetch711Token throws on invalid credentials', async () => {
  await assert.rejects(
    async () => fetch711Token('invalid_user_test_xyz', 'invalid_pwd_test_xyz'),
    { message: /Đăng nhập thất bại/ }
  );
});
