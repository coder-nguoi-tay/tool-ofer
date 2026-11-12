import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { connect, createServer as createTcpServer } from 'node:net';
import { startAuthenticatedHttpRelay } from '../src/relay/start-authenticated-http-relay.mjs';
import { recordRelayUsage } from '../src/monitoring/bandwidth/record-relay-usage.mjs';
import { getTopRelayHosts } from '../src/monitoring/bandwidth/get-top-relay-hosts.mjs';
import { bandwidthDailyStats } from '../src/monitoring/bandwidth/state/bandwidth-daily-stats.mjs';
import { getLocalDateKey } from '../src/monitoring/bandwidth/get-local-date-key.mjs';
import { handleGetBandwidthStats } from '../src/http/routes/bandwidth/get-stats.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';

// Nghiên cứu 2026-11-13: proxy 711 tính gấp 3–4 lần số Playwright `request.sizes()` đo được.
// Relay cục bộ nhìn thấy MỌI byte Chrome gửi/nhận qua proxy (TLS, CONNECT, socket) → đếm tại đây là số thật.

/**
 * Proxy upstream giả: CONNECT nối tới server đích cục bộ; request thường trả body 1.000 byte.
 * @param {number} targetPort Cổng server đích cho CONNECT.
 * @return {Promise<{port: number, close: () => void}>} Cổng proxy giả.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
async function startFakeUpstreamProxy(targetPort) {
  const server = createHttpServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('X'.repeat(1000)); });
  server.on('connect', (req, socket, head) => {
    assert.match(req.headers['proxy-authorization'] || '', /^Basic /, 'relay phải gắn Proxy-Authorization');
    const target = connect(targetPort, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
      if (head.length) target.write(head);
      socket.pipe(target); target.pipe(socket);
    });
    target.on('error', () => socket.destroy()); socket.on('error', () => target.destroy());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, close: () => server.close() };
}

test('relay HTTP: đếm byte hai chiều theo host cho CONNECT (HTTPS) và request thường', async t => {
  const echo = createTcpServer(socket => socket.pipe(socket));
  await new Promise(resolve => echo.listen(0, '127.0.0.1', resolve));
  const echoPort = echo.address().port;
  const upstream = await startFakeUpstreamProxy(echoPort);
  const relay = await startAuthenticatedHttpRelay({ server: `http://127.0.0.1:${upstream.port}`, username: 'u', password: 'p' });
  t.after(async () => { await relay.close(); upstream.close(); echo.close(); });
  const relayPort = Number(new URL(relay.proxy.server).port);

  // 1. CONNECT tới echo, gửi 5.000 byte, nhận lại 5.000 byte.
  const payload = Buffer.alloc(5000, 'a');
  await new Promise((resolve, reject) => {
    const socket = connect(relayPort, '127.0.0.1');
    let received = Buffer.alloc(0), established = false;
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk]);
      if (!established && received.includes('\r\n\r\n')) { established = true; received = Buffer.alloc(0); socket.write(payload); return; }
      if (established && received.length >= payload.length) { socket.end(); resolve(); }
    });
    socket.on('error', reject);
    socket.write(`CONNECT 127.0.0.1:${echoPort} HTTP/1.1\r\nHost: 127.0.0.1:${echoPort}\r\n\r\n`);
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  const afterConnect = relay.readBytes();
  const tunnel = afterConnect.hosts[`127.0.0.1:${echoPort}`];
  assert.ok(tunnel, `phải có host của tunnel: ${Object.keys(afterConnect.hosts)}`);
  assert.ok(tunnel.up >= 5000 && tunnel.up < 5300, `up ≈ 5000 + dòng CONNECT, được ${tunnel.up}`);
  assert.ok(tunnel.down >= 5000 && tunnel.down < 5300, `down ≈ 5000 + dòng 200, được ${tunnel.down}`);
  assert.equal(afterConnect.up, tunnel.up);
  assert.equal(afterConnect.down, tunnel.down);

  // 2. Request HTTP thường qua relay → host lấy từ URL, down ≥ 1.000 byte body.
  await new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: relayPort, method: 'GET', path: 'http://plain.example/page', headers: { host: 'plain.example' } }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', reject); req.end();
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  const afterPlain = relay.readBytes();
  assert.ok(afterPlain.hosts['plain.example']?.down >= 1000, JSON.stringify(afterPlain.hosts));
  assert.ok(afterPlain.down > afterConnect.down + 1000);
});

test('recordRelayUsage: cộng vào ngày + host; getTopRelayHosts gộp hôm nay với phiên đang chạy và xếp giảm dần', () => {
  const day = bandwidthDailyStats.daily[getLocalDateKey()];
  const before = { up: day?.relayBytesSent || 0, down: day?.relayBytesReceived || 0 };
  recordRelayUsage({ up: 100, down: 900, hosts: { 'ads.test': { up: 60, down: 600 }, 'offer.test': { up: 40, down: 300 } } });
  recordRelayUsage(null);
  recordRelayUsage({ up: 0, down: 0, hosts: {} });
  const today = bandwidthDailyStats.daily[getLocalDateKey()];
  assert.equal(today.relayBytesSent - before.up, 100);
  assert.equal(today.relayBytesReceived - before.down, 900);
  assert.ok(today.relayHosts['ads.test'] >= 660);
  const top = getTopRelayHosts(today, [{ readRelayBytes: () => ({ up: 0, down: 0, hosts: { 'offer.test': { up: 0, down: 5000 } } }) }, {}], 2);
  assert.deepEqual(top.map(h => h.host), ['offer.test', 'ads.test']);
  assert.ok(top[0].bytes >= 5340);
});

test('GET /bandwidth/stats: mỗi luồng có số relay thật, kèm host tốn nhất', async () => {
  const session = { slot: 7, exitIp: '203.0.113.9', browser: { pages: () => [] }, bandwidthBytes: 10, readRelayBytes: () => ({ up: 1, down: 2, hosts: { 'a.test': { up: 1, down: 2 } } }) };
  activeBrowsers.add(session);
  try {
    const out = {};
    const response = { writeHead: () => {}, end: body => { out.body = JSON.parse(body); } };
    assert.equal(await handleGetBandwidthStats({ method: 'GET', url: '/bandwidth/stats' }, response), true);
    const slot = out.body.activeSlots.find(s => s.slot === 7);
    assert.deepEqual({ up: slot.relay.up, down: slot.relay.down, total: slot.relay.total }, { up: 1, down: 2, total: 3 });
    assert.ok(Array.isArray(out.body.topHosts) && out.body.topHosts.some(h => h.host === 'a.test'));
    assert.ok(typeof out.body.today.relayFormatted === 'string');
  } finally { activeBrowsers.delete(session); }
});
