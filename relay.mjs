import { createServer, connect } from 'node:net';
import { createServer as createHttpServer, request as requestHttp } from 'node:http';
import { readFile } from 'node:fs/promises';

/**
 * Relay SOCKS5 thêm xác thực.
 *
 * Playwright chỉ chào method "no auth" nên không dùng được proxy SOCKS5 bắt buộc đăng nhập.
 * Relay này nhận kết nối no-auth từ Playwright, rồi tự chào method 02 với upstream, làm
 * xác thực RFC 1929, và chuyển tiếp nguyên văn yêu cầu CONNECT.
 *
 *   Playwright --no-auth--> 127.0.0.1:1080 --user/pass--> host:port
 *
 * Mỗi dòng trong file proxy được gán một port local riêng, nên map 1 port ↔ 1 IP exit
 * của upstream được giữ nguyên.
 *
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */

const basePort = Number(process.env.AUTOLEADPC_RELAY_PORT) || 1080;
const handshakeTimeout = 20_000;

const SOCKS5 = 0x05;
const NO_AUTH = 0x00;
const USER_PASS = 0x02;
const GENERAL_FAILURE = Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);

/**
 * Bộ đọc theo số byte chính xác trên socket.
 *
 * @param {import('node:net').Socket} socket Socket cần đọc.
 * @return {{read: (size: number) => Promise<Buffer>, detach: () => Buffer}} Bộ đọc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
function createReader(socket) {
  let buffer = Buffer.alloc(0);
  let waiter = null;
  let failure = null;

  const settle = () => {
    if (!waiter) return;
    if (buffer.length >= waiter.size) {
      const { size, resolve } = waiter;
      waiter = null;
      const head = buffer.subarray(0, size);
      buffer = buffer.subarray(size);
      resolve(head);
      return;
    }
    if (failure) {
      const { reject } = waiter;
      waiter = null;
      reject(failure);
    }
  };

  const onData = (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    settle();
  };
  const onEnd = () => {
    failure ??= new Error('đối phương đóng kết nối giữa lúc bắt tay');
    settle();
  };
  const onError = (error) => {
    failure ??= error;
    settle();
  };

  socket.on('data', onData);
  socket.on('end', onEnd);
  socket.on('close', onEnd);
  socket.on('error', onError);

  return {
    read(size) {
      if (size === 0) return Promise.resolve(Buffer.alloc(0));
      return new Promise((resolve, reject) => {
        // ponytail: một waiter tại một thời điểm, đủ vì bắt tay SOCKS5 là tuần tự.
        if (waiter) return reject(new Error('đọc lồng nhau'));
        waiter = { size, resolve, reject };
        settle();
      });
    },
    // Trả lại phần byte đã đọc trước mà chưa dùng, và thôi can thiệp vào socket.
    detach() {
      socket.off('data', onData);
      socket.off('end', onEnd);
      socket.off('close', onEnd);
      socket.off('error', onError);
      return buffer;
    },
  };
}

/**
 * Đọc phần địa chỉ của một yêu cầu SOCKS5 theo ATYP.
 *
 * @param {object} reader Bộ đọc socket.
 * @param {number} addressType Giá trị ATYP.
 * @return {Promise<Buffer>} Byte địa chỉ kèm port.
 * @throws {Error} Khi ATYP không hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
async function readAddress(reader, addressType) {
  if (addressType === 0x01) return reader.read(4 + 2);
  if (addressType === 0x04) return reader.read(16 + 2);
  if (addressType === 0x03) {
    const length = await reader.read(1);
    return Buffer.concat([length, await reader.read(length[0] + 2)]);
  }
  throw new Error(`ATYP không hỗ trợ: ${addressType}`);
}

/**
 * Xác thực với upstream rồi chuyển tiếp yêu cầu CONNECT.
 *
 * @param {object} proxy Upstream kèm thông tin đăng nhập.
 * @param {Buffer} request Yêu cầu SOCKS5 nguyên văn của client.
 * @return {Promise<{socket: import('node:net').Socket, leftover: Buffer}>} Socket đã sẵn sàng.
 * @throws {Error} Khi upstream từ chối method hoặc thông tin đăng nhập.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
async function openUpstream(proxy, request) {
  const socket = connect({ host: proxy.host, port: proxy.port });
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
    socket.write(
      Buffer.concat([
        Buffer.from([0x01, username.length]),
        username,
        Buffer.from([password.length]),
        password,
      ]),
    );
    const auth = await reader.read(2);
    if (auth[1] !== 0x00) throw new Error('upstream từ chối user/pass');

    socket.write(request);
    socket.setTimeout(0);
    return { socket, leftover: reader.detach() };
  } catch (error) {
    reader.detach();
    socket.destroy();
    throw error;
  }
}

/**
 * Xử lý một kết nối từ Playwright.
 *
 * @param {import('node:net').Socket} client Socket của client.
 * @param {object} proxy Upstream tương ứng với port local này.
 * @return {Promise<void>} Hoàn tất khi đã nối hai chiều hoặc đã báo lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
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

    const { socket: upstream, leftover } = await openUpstream(proxy, request);
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

/**
 * Mở relay cục bộ cho một SOCKS5 có user/password để Chrome dùng proxy đó.
 *
 * @param {{server: string, username: string, password: string}} proxy Proxy gốc đã phân tích.
 * @return {Promise<{proxy: {server: string}, close: () => Promise<void>}>} Proxy local và hàm đóng relay.
 * @throws {Error} Khi không thể mở cổng relay cục bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
export async function startAuthenticatedSocksRelay(proxy) {
  const upstreamUrl = new URL(proxy.server);
  const upstream = {
    host: upstreamUrl.hostname,
    port: Number(upstreamUrl.port),
    username: proxy.username,
    password: proxy.password,
  };
  const clients = new Set();
  const server = createServer((client) => {
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
    proxy: { server: `socks5://127.0.0.1:${upstream.localPort}` },
    close: () => new Promise((resolve) => {
      for (const client of clients) client.destroy();
      server.close(resolve);
    }),
  };
}

/**
 * Mở proxy HTTP trên loopback và thêm thông tin xác thực khi chuyển yêu cầu tới upstream.
 *
 * @param {{server: string, username: string, password: string}} proxy Proxy HTTP đã phân tích.
 * @return {Promise<{proxy: {server: string}, close: () => Promise<void>}>} Proxy local và hàm đóng relay.
 * @throws {Error} Khi không thể mở cổng relay cục bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function startAuthenticatedHttpRelay(proxy) {
  const upstreamUrl = new URL(proxy.server);
  const authorization = `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`;
  const sockets = new Set();
  const server = createHttpServer((clientRequest, clientResponse) => {
    const upstreamRequest = requestHttp({
      host: upstreamUrl.hostname,
      port: Number(upstreamUrl.port),
      method: clientRequest.method,
      path: clientRequest.url,
      headers: { ...clientRequest.headers, 'proxy-authorization': authorization },
    }, (upstreamResponse) => {
      clientResponse.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
      upstreamResponse.pipe(clientResponse);
    });
    upstreamRequest.on('error', () => clientResponse.destroy());
    clientRequest.pipe(upstreamRequest);
  });
  server.on('connection', (socket) => {
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
    proxy: { server: `http://127.0.0.1:${server.address().port}` },
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}

/**
 * Đọc file proxy dạng host:port|user|pass và gán port local cho từng dòng.
 *
 * @param {string} path Đường dẫn file proxy.
 * @return {Promise<object[]>} Danh sách upstream kèm port local.
 * @throws {Error} Khi không có dòng nào hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
export async function readUpstreams(path) {
  const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
  const upstreams = [];

  for (const [index, line] of lines.entries()) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;

    const [hostAndPort, username, ...passwordParts] = value.split('|');
    const separator = hostAndPort.lastIndexOf(':');
    const port = Number(hostAndPort.slice(separator + 1));
    const password = passwordParts.join('|');

    if (separator < 1 || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Dòng ${index + 1}: cần host:port|user|pass.`);
    }
    if (!username || !password) {
      throw new Error(`Dòng ${index + 1}: thiếu user/pass — relay chỉ dùng cho proxy có xác thực.`);
    }

    upstreams.push({
      host: hostAndPort.slice(0, separator),
      port,
      username,
      password,
      localPort: basePort + upstreams.length,
    });
  }

  if (upstreams.length === 0) throw new Error('File proxy không có dòng nào hợp lệ.');
  return upstreams;
}

async function main() {
  const path = process.argv[2] ?? './proxies-auth.txt';
  const upstreams = await readUpstreams(path);

  await Promise.all(
    upstreams.map(
      (proxy) =>
        new Promise((resolve, reject) => {
          const server = createServer((client) => handleClient(client, proxy));
          server.on('error', reject);
          server.listen(proxy.localPort, '127.0.0.1', () => {
            console.log(`127.0.0.1:${proxy.localPort}  ->  ${proxy.host}:${proxy.port}`);
            resolve();
          });
        }),
    ),
  );

  console.log(`\n${upstreams.length} relay đang chạy. Dán danh sách này vào app, Loại proxy = SOCKS5:\n`);
  console.log(upstreams.map(({ localPort }) => `127.0.0.1:${localPort}`).join('\n'));
  console.log('\nCtrl+C để dừng.');
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
