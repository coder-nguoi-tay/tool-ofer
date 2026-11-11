import { createServer } from 'node:net';
import { handleClient } from './handle-client.mjs';

/**
 * Mở relay cục bộ cho một SOCKS5 có user/password để Chrome dùng proxy đó.
 *
 * @param {{server: string, username: string, password: string}} proxy Proxy gốc đã phân tích.
 * @return {Promise<{proxy: {server: string}, close: () => Promise<void>}>} Proxy local và hàm đóng relay.
 * @throws {Error} Khi không thể mở cổng relay cục bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function startAuthenticatedSocksRelay(proxy) {
  const upstreamUrl = new URL(proxy.server);
  const upstream = {
    host: upstreamUrl.hostname,
    port: Number(upstreamUrl.port),
    username: proxy.username,
    password: proxy.password
  };
  const clients = new Set();
  const server = createServer(client => {
    clients.add(client);
    client.on('close', () => clients.delete(client));
    void handleClient(client, upstream);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  upstream.localPort = server.address().port;
  return {
    proxy: {
      server: `socks5://127.0.0.1:${upstream.localPort}`
    },
    close: () => new Promise(resolve => {
      for (const client of clients) client.destroy();
      server.close(resolve);
    })
  };
}
export { startAuthenticatedSocksRelay };
