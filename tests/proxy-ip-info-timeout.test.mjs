import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { requestProxyIpInfo } from '../src/proxy/actions/request-proxy-ip-info.mjs';

test('proxy nhận TCP nhưng không trả lời CONNECT: tra IP báo lỗi hết giờ, không treo lượt bù slot', async context => {
  const sockets = new Set();
  const server = net.createServer(socket => sockets.add(socket)).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const proxy = { server: `http://127.0.0.1:${server.address().port}`, username: 'fixture', password: 'fixture' };
  const startedAt = Date.now();
  await assert.rejects(requestProxyIpInfo(proxy, 'https://geo.test'), /Timeout tra IP/);
  // 4 giây dịch vụ chính + 5 giây dự phòng.
  assert.ok(Date.now() - startedAt < 12000, 'phải dừng theo hạn chót, không chờ mãi');
});
