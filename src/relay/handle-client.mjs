import { GENERAL_FAILURE } from './state/general-failure.mjs';
import { NO_AUTH } from './state/no-auth.mjs';
import { SOCKS5 } from './state/socks5.mjs';
import { createReader } from './create-reader.mjs';
import { handshakeTimeout } from './state/handshake-timeout.mjs';
import { openUpstream } from './open-upstream.mjs';
import { readAddress } from './read-address.mjs';

/**
 * Xử lý một kết nối từ Playwright.
 *
 * @param {import('node:net').Socket} client Socket của client.
 * @param {object} proxy Upstream tương ứng với port local này.
 * @return {Promise<void>} Hoàn tất khi đã nối hai chiều hoặc đã báo lỗi.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleClient(client, proxy) {
  client.setTimeout(handshakeTimeout);
  const reader = createReader(client);
  try {
    const greeting = await reader.read(2);
    if (greeting[0] !== SOCKS5) throw new Error('client không nói SOCKS5');
    await reader.read(greeting[1]);
    client.write(Buffer.from([SOCKS5, NO_AUTH]));
    const head = await reader.read(4);
    const request = Buffer.concat([head, await readAddress(reader, head[3])]);
    const {
      socket: upstream,
      leftover
    } = await openUpstream(proxy, request);
    const pending = reader.detach();
    client.setTimeout(0);
    if (leftover.length > 0) client.write(leftover);
    if (pending.length > 0) upstream.write(pending);
    client.pipe(upstream);
    upstream.pipe(client);
    const shutdown = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', shutdown);
    upstream.on('error', shutdown);
    client.on('close', shutdown);
    upstream.on('close', shutdown);
  } catch (error) {
    console.error(`[${proxy.localPort}] ${error.message}`);
    reader.detach();
    if (client.writable) client.write(GENERAL_FAILURE);
    client.destroy();
  }
}
export { handleClient };
