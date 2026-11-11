import { persistedBrowserLogs } from '../../../logging/browser-logs.mjs';

/**
 * Xử lý API browser-logs-export-csv.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetBrowserLogsExportCsv(request, response) {
  if (request.method === 'GET' && request.url.startsWith('/browser-logs/export-csv')) {
    const parsedUrl = new URL(request.url, 'http://localhost');
    const offerFilter = parsedUrl.searchParams.get('offer');
    const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Thời gian', 'Offer #', 'Slot', 'IP Exit', 'Loại sự kiện', 'Chi tiết thao tác', 'Tên file HTML', 'URL trang'].map(csvCell).join(',')];
    for (const session of persistedBrowserLogs) {
      for (const entry of session.logs || []) {
        const entryOffer = String(entry.offer ?? session.offer ?? 1);
        if (offerFilter && entryOffer !== offerFilter) continue;
        rows.push([entry.time || '', entryOffer, session.slot ?? '', session.ip ?? '', entry.type ?? '', entry.detail || entry.text || entry.url || '', entry.htmlFilename || '', entry.url || session.offerUrl || ''].map(csvCell).join(','));
      }
    }
    const filename = offerFilter ? `autoleadpc-offer-${offerFilter}-logs.csv` : 'autoleadpc-interaction-logs.csv';
    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`
    });
    response.end('\uFEFF' + rows.join('\r\n'), 'utf8');
    return true;
  }
  return false;
}
