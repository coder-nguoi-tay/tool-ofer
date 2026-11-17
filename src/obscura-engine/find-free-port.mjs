import { createServer } from 'node:net';

/**
 * Tìm một cổng TCP khả dụng trên 127.0.0.1.
 * Nếu preferredPort bận, hệ điều hành sẽ tự cấp phát một cổng trống ngẫu nhiên.
 *
 * @param {number} [preferredPort=0] Cổng ưu tiên.
 * @return {Promise<number>} Cổng TCP đang rảnh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export async function findFreePort(preferredPort = 0) {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();

    srv.on('error', () => {
      if (preferredPort !== 0) {
        // Cổng ưu tiên đang bị chiếm, chuyển sang xin cổng ngẫu nhiên từ OS
        findFreePort(0).then(resolve, reject);
      } else {
        reject(new Error('Không thể tìm cổng trống khả dụng'));
      }
    });

    srv.listen(preferredPort, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : preferredPort;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}
