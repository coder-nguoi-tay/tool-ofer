import assert from 'node:assert/strict';
import test from 'node:test';
import { handleGetPublicIp } from '../src/http/routes/proxy/get-public-ip.mjs';

test('route IP máy Mac chỉ nhận GET /proxy/public-ip', async () => {
  const response = { writeHead() { assert.fail('không được trả lời request khác'); }, end() {} };
  assert.equal(await handleGetPublicIp({ method: 'POST', url: '/proxy/public-ip' }, response), false);
  assert.equal(await handleGetPublicIp({ method: 'GET', url: '/proxy-queue' }, response), false);
});
