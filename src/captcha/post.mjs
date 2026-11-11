import { request as httpsRequest } from 'node:https';

/**
 * Post.
 * @param {string} hostname hostname.
 * @param {string} path path.
 * @param {*} body body.
 * @return {*} Kết quả xử lý post.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body);
    const req = httpsRequest({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': bodyBuf.length
      }
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}
export { post };
