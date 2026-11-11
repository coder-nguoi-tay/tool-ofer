import { activeBrowsers } from '../../../browser/sessions.mjs';
import { captureScreenThumbnail } from '../../../browser/screen/capture-screen-thumbnail.mjs';

/**
 * Trả thumbnail có cache và giới hạn tải chụp chung giữa các phiên.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handleGetScreenSnapshot(request, response) {
  if (request.method === 'GET' && request.url.startsWith('/screen/snapshot/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
    if (!session) {
      response.writeHead(404);
      response.end();
      return true;
    }
    const diagnostics = session.screenDiagnostics ??= {
      windowStartedAt: Date.now(),
      requests: 0,
      captures: 0,
      captureFailures: 0,
      captureDurationTotalMs: 0,
      captureDurationMaxMs: 0
    };
    diagnostics.requests += 1;
    if (Date.now() - diagnostics.windowStartedAt >= 10_000) {
      const averageCaptureMs = diagnostics.captures ? Math.round(diagnostics.captureDurationTotalMs / diagnostics.captures) : 0;
      console.log(`[ScreenDiag] slot=${slot} window=10s requests=${diagnostics.requests} captures=${diagnostics.captures} captureErrors=${diagnostics.captureFailures} avgCaptureMs=${averageCaptureMs} maxCaptureMs=${diagnostics.captureDurationMaxMs} pageCount=${session.browser.pages().filter(p => !p.isClosed()).length}`);
      diagnostics.windowStartedAt = Date.now();
      diagnostics.requests = 0;
      diagnostics.captures = 0;
      diagnostics.captureFailures = 0;
      diagnostics.captureDurationTotalMs = 0;
      diagnostics.captureDurationMaxMs = 0;
    }
    try {
      const pages = session.browser.pages().filter(p => !p.isClosed());
      const page = session.mainPage && !session.mainPage.isClosed() ? session.mainPage : pages[0];
      if (!page) {
        response.writeHead(404);
        response.end();
        return true;
      }
      const buf = await captureScreenThumbnail(session, page, diagnostics);
      if (!buf) {
        response.writeHead(503);
        response.end();
        return true;
      }
      response.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store'
      });
      response.end(buf);
    } catch {
      response.writeHead(503);
      response.end();
    }
    return true;
  }
  return false;
}
