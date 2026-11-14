import { buildClientHintHeaders } from '../../stealth/build-client-hint-headers.mjs';
import { mergeClientHintHeaders } from '../../stealth/merge-client-hint-headers.mjs';

/**
 * Bù Client Hints cho request điều hướng https (kể cả redirect 301/302/307) bằng đúng giá trị Orbita trả cho JS,
 * để tracking không ghi "Window 0"/"Chrome X.0.0.0" mà header vẫn trùng trang và worker.
 * @param {object} context Context Orbita.
 * @param {object} page Tab cần bù header.
 * @param {object} hints Kết quả navigator.userAgentData.getHighEntropyValues đọc trong Orbita.
 * @return {Promise<void>} Đã bật chặn Document https và thay header khi request đi qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function injectOrbitaClientHintHeaders(context, page, hints) {
  const connection = await context.newCDPSession(page);
  const headers = buildClientHintHeaders(hints, {
    'Sec-CH-UA-Full-Version-List': hints.fullVersionList.map(brand => `"${brand.brand}";v="${brand.version}"`).join(', '),
    'Sec-CH-UA-Full-Version': `"${hints.uaFullVersion}"`
  });
  connection.on('Fetch.requestPaused', async ({ requestId, request }) => {
    try {
      await connection.send('Fetch.continueRequest', { requestId, headers: mergeClientHintHeaders(request?.headers, headers) });
    } catch {
      // Header bị từ chối thì vẫn cho request đi tiếp nguyên bản, không để trang treo ở trạng thái paused.
      await connection.send('Fetch.continueRequest', { requestId }).catch(() => {});
    }
  });
  await connection.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', resourceType: 'Document', requestStage: 'Request' }] });
}
