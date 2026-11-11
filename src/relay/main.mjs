import { createServer } from 'node:net';
import { handleClient } from './handle-client.mjs';
import { readUpstreams } from './read-upstreams.mjs';

/**
 * Main.
 * @return {Promise<void>} Kết quả xử lý main.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function main() {
  const path = process.argv[2] ?? './proxies-auth.txt';
  const upstreams = await readUpstreams(path);
  await Promise.all(upstreams.map(proxy => new Promise((resolve, reject) => {
    const server = createServer(client => handleClient(client, proxy));
    server.on('error', reject);
    server.listen(proxy.localPort, '127.0.0.1', () => {
      console.log(`127.0.0.1:${proxy.localPort}  ->  ${proxy.host}:${proxy.port}`);
      resolve();
    });
  })));
  console.log(`\n${upstreams.length} relay đang chạy. Dán danh sách này vào app, Loại proxy = SOCKS5:\n`);
  console.log(upstreams.map(({
    localPort
  }) => `127.0.0.1:${localPort}`).join('\n'));
  console.log('\nCtrl+C để dừng.');
}
export { main };
