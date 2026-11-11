import { readFileSync } from 'node:fs';
import { readUiAsset } from './read-ui-asset.mjs';
const assetPaths = JSON.parse(readFileSync(new URL('../../ui/assets.json', import.meta.url), 'utf8'));
const assets = new Map(assetPaths.map(name => [`/assets/${name}`, {
  name,
  contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript'
}]));

/**
 * Phục vụ CSS và JavaScript của các giao diện qua danh sách đường dẫn cố định.
 * @param {import('node:http').IncomingMessage} request Yêu cầu giao diện.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi yêu cầu thuộc tuyến tài nguyên giao diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function serveUiAsset(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  const asset = assets.get(request.url?.split('?')[0]);
  if (!asset) return false;
  try {
    const content = await readUiAsset(asset.name);
    response.writeHead(200, {
      'content-type': `${asset.contentType}; charset=utf-8`,
      'cache-control': 'no-store'
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404);
    response.end();
  }
  return true;
}
