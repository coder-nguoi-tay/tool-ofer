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
  const server = createHttpServer((clientRequest, clientResponse) => {
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
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('connect', (clientRequest, clientSocket, head) => {
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
  return {
    proxy: {
      server: `http://127.0.0.1:${server.address().port}`
    },
    close: () => new Promise(resolve => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    })
  };
}
export { startAuthenticatedHttpRelay };
