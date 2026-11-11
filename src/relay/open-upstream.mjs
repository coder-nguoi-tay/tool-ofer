import { SOCKS5 } from './state/socks5.mjs';
import { USER_PASS } from './state/user-pass.mjs';
import { connect } from 'node:net';
import { createReader } from './create-reader.mjs';
import { handshakeTimeout } from './state/handshake-timeout.mjs';

/**
 * Xác thực với upstream rồi chuyển tiếp yêu cầu CONNECT.
 *
 * @param {object} proxy Upstream kèm thông tin đăng nhập.
 * @param {Buffer} request Yêu cầu SOCKS5 nguyên văn của client.
 * @return {Promise<{socket: import('node:net').Socket, leftover: Buffer}>} Socket đã sẵn sàng.
 * @throws {Error} Khi upstream từ chối method hoặc thông tin đăng nhập.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function openUpstream(proxy, request) {
  const socket = connect({
    host: proxy.host,
    port: proxy.port
  });
  socket.setTimeout(handshakeTimeout);
  const reader = createReader(socket);
  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
      socket.once('timeout', () => reject(new Error('upstream không phản hồi')));
    });
    socket.write(Buffer.from([SOCKS5, 0x01, USER_PASS]));
    const method = await reader.read(2);
    if (method[1] !== USER_PASS) {
      throw new Error(`upstream không nhận user/pass (trả ${method.toString('hex')})`);
    }
    const username = Buffer.from(proxy.username, 'utf8');
    const password = Buffer.from(proxy.password, 'utf8');
    socket.write(Buffer.concat([Buffer.from([0x01, username.length]), username, Buffer.from([password.length]), password]));
    const auth = await reader.read(2);
    if (auth[1] !== 0x00) throw new Error('upstream từ chối user/pass');
    socket.write(request);
    socket.setTimeout(0);
    return {
      socket,
      leftover: reader.detach()
    };
  } catch (error) {
    reader.detach();
    socket.destroy();
    throw error;
  }
}
export { openUpstream };
