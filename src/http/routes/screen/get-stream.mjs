import { activeBrowsers } from '../../../browser/sessions.mjs';
import { attachScreencastSession } from '../../../browser/screencast.mjs';
import { createViewerHub } from '../../../browser/screencast.mjs';
import { releaseScreencast } from '../../../browser/screencast.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Xử lý API screen-stream.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetScreenStream(request, response) {
  if (request.method === 'GET' && request.url.startsWith('/screen/stream/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
    if (!session) {
      response.writeHead(404);
      response.end();
      return true;
    }

    // Trình duyệt giữ nguyên trạng thái chạy ngầm, không tự bung cửa sổ ra Desktop khi xem trực tiếp trong app
    // Chỉ khi người dùng bấm nút hiện cửa sổ ngoài Desktop thì mới bung ra

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.write('retry: 1500\n\n');

    // Slot đã có người xem (vd app PC đang xem, mở thêm Telegram mini): xem chung, không đá nhau.
    const existing = screencastSessions.get(slot);
    if (existing && !existing.cleaned) {
      existing.sseResponse.add(response);
      const leaveExisting = () => {
        existing.sseResponse.remove(response);
        if (existing.sseResponse.size === 0) void existing.cleanup?.();
      };
      request.on('close', leaveExisting);
      response.on('close', leaveExisting);
      return true;
    }
    try {
      const pages = session.browser.pages().filter(p => !p.isClosed());
      const page = session.mainPage && !session.mainPage.isClosed() ? session.mainPage : pages[0];
      if (!page) {
        response.end();
        return true;
      }
      const hub = createViewerHub();
      hub.add(response);
      const scObj = {
        sseResponse: hub
      };
      screencastSessions.set(slot, scObj);
      // Gắn dọn dẹp TRƯỚC mọi await: người xem cuối rời đi giữa chừng vẫn tắt được screencast của slot.
      // Chỉ dọn đúng luồng của mình — luồng mới cùng slot không bị luồng cũ đóng nhầm.
      scObj.cleanup = async () => {
        if (scObj.cleaned) return;
        scObj.cleaned = true;
        if (screencastSessions.get(slot) === scObj) screencastSessions.delete(slot);
        await releaseScreencast(scObj);
        hub.end();
      };
      const leave = () => {
        hub.remove(response);
        if (hub.size === 0) void scObj.cleanup();
      };
      request.on('close', leave);
      response.on('close', leave);
      const cdpClient = await session.browser.newCDPSession(page);
      if (scObj.cleaned) {
        await cdpClient.detach().catch(() => {});
        return true;
      }
      await attachScreencastSession(scObj, cdpClient, page, slot, session);
      // Người xem cuối rời đi đúng lúc đang attach: cleanup đã chạy trước khi gắn xong → tháo nốt.
      if (scObj.cleaned) await releaseScreencast(scObj);
    } catch (err) {
      console.error(`[ScreenStream] Lỗi khởi tạo SSE slot ${slot}:`, err.message);
      response.write(`data: error\n\n`);
      response.end();
    }
    return true;
  }
  return false;
}
