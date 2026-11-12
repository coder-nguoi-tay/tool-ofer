import { connect } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { handshakeTimeout } from './state/handshake-timeout.mjs';
import { request as requestHttp } from 'node:http';

/**
 * Mở proxy HTTP trên loopback và thêm thông tin xác thực khi chuyển yêu cầu tới upstream.
 *
 * @param {{server: string, username: string, password: string}} proxy Proxy HTTP đã phân tích.
 * @return {Promise<{proxy: {server: string}, close: () => Promise<void>}>} Proxy local và hàm đóng relay.
 * @throws {Error} Khi không thể mở cổng relay cục bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function startAuthenticatedHttpRelay(proxy) {
  const upstreamUrl = new URL(proxy.server);
  const authorization = `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`;
  const sockets = new Set();
  // Đếm byte tại socket phía Chrome: bytesRead = Chrome→proxy, bytesWritten = proxy→Chrome. Node tự đếm trên socket,
  // không chạm vào luồng dữ liệu. Phần relay thêm vào (Proxy-Authorization ~100 B/kết nối) không tính — sai số nhỏ.
  const clientSockets = new Set();
  const hostBySocket = new WeakMap();
  const closed = { up: 0, down: 0, hosts: {} };
  const addHost = (host, up, down) => {
    const bucket = closed.hosts[host] || (closed.hosts[host] = { up: 0, down: 0 });
    bucket.up += up; bucket.down += down;
  };
  const server = createHttpServer((clientRequest, clientResponse) => {
    try { hostBySocket.set(clientRequest.socket, new URL(clientRequest.url).host); } catch {}
    const upstreamRequest = requestHttp({
      host: upstreamUrl.hostname,
      port: Number(upstreamUrl.port),
      method: clientRequest.method,
      path: clientRequest.url,
      headers: {
        ...clientRequest.headers,
        'proxy-authorization': authorization
      }
    }, upstreamResponse => {
      clientResponse.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
      upstreamResponse.pipe(clientResponse);
    });
    upstreamRequest.on('error', () => clientResponse.destroy());
    clientRequest.pipe(upstreamRequest);
  });
  server.on('connection', socket => {
    sockets.add(socket);
    clientSockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
      clientSockets.delete(socket);
      closed.up += socket.bytesRead; closed.down += socket.bytesWritten;
      addHost(hostBySocket.get(socket) || 'unknown', socket.bytesRead, socket.bytesWritten);
    });
  });
  server.on('connect', (clientRequest, clientSocket, head) => {
    hostBySocket.set(clientSocket, clientRequest.url);
    const upstreamSocket = connect(Number(upstreamUrl.port), upstreamUrl.hostname);
    sockets.add(upstreamSocket);
    upstreamSocket.on('close', () => sockets.delete(upstreamSocket));
    upstreamSocket.setTimeout(handshakeTimeout);
    upstreamSocket.on('connect', () => {
      upstreamSocket.write(`CONNECT ${clientRequest.url} HTTP/1.1\r\nHost: ${clientRequest.url}\r\nProxy-Authorization: ${authorization}\r\n\r\n`);
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
    upstreamSocket.on('error', () => clientSocket.destroy());
    upstreamSocket.on('timeout', () => upstreamSocket.destroy());
    clientSocket.on('error', () => upstreamSocket.destroy());
    clientSocket.on('close', () => upstreamSocket.destroy());
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  /**
   * Số byte đã qua relay tới giờ (phiên đóng + socket đang mở), tổng và theo host.
   * @return {{up: number, down: number, hosts: Object<string, {up: number, down: number}>}} Byte lên/xuống.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-13
   */
  const readBytes = () => {
    const snapshot = { up: closed.up, down: closed.down, hosts: {} };
    for (const [host, bytes] of Object.entries(closed.hosts)) snapshot.hosts[host] = { ...bytes };
    for (const socket of clientSockets) {
      snapshot.up += socket.bytesRead; snapshot.down += socket.bytesWritten;
      const host = hostBySocket.get(socket) || 'unknown';
      const bucket = snapshot.hosts[host] || (snapshot.hosts[host] = { up: 0, down: 0 });
      bucket.up += socket.bytesRead; bucket.down += socket.bytesWritten;
    }
    return snapshot;
  };
  return {
    proxy: {
      server: `http://127.0.0.1:${server.address().port}`
    },
    readBytes,
    close: () => new Promise(resolve => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    })
  };
}
export { startAuthenticatedHttpRelay };
