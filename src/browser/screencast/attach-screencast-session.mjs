import { activeBrowsers } from '../sessions.mjs';
import { isWindowMinimized } from './is-window-minimized.mjs';

/**
 * Gắn screencast của một tab vào kết nối SSE của một slot. Mỗi slot có trạng thái, timer và
 * cơ chế chống nghẽn riêng: một slot treo hoặc người xem chậm không làm ảnh hưởng slot khác.
 *
 * @param {object} scObj Trạng thái stream của slot ({ sseResponse, cleaned?, ... })
 * @param {import('playwright').CDPSession} cdpSession
 * @param {import('playwright').Page} targetPage
 * @param {number|null} [slot]
 * @param {object|null} [session]
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function attachScreencastSession(scObj, cdpSession, targetPage, slot = null, session = null) {
  // Route đổi/mở/đóng tab gọi lại không kèm slot/session: giữ của lần gắn trước để còn tự khôi phục được.
  slot = slot ?? scObj.slot ?? null;
  session = session ?? scObj.session ?? null;
  // Gỡ listener của tab/phiên CDP trước: tab cũ đóng sau này không được kéo màn xem đi.
  scObj.unbindListeners?.();
  scObj.unbindListeners = null;
  if (scObj.keepaliveTimer) {
    clearInterval(scObj.keepaliveTimer);
    scObj.keepaliveTimer = null;
  }
  scObj.cdpClient = cdpSession;
  scObj.page = targetPage;
  scObj.slot = slot;
  scObj.session = session;
  scObj.lastFrameTime = Date.now();

  let attached = true;
  let reconnecting = false;
  let captureInFlight = false;

  // Tự động khôi phục session khi tab chuyển trang (navigation) hoặc bị detach
  const onDetachOrClose = async () => {
    // Listener của tab/phiên CDP đã bị thay thế: bỏ qua, không kéo màn xem về tab khác.
    if (!attached || scObj.cdpClient !== cdpSession) return;
    if (scObj.cleaned || reconnecting || scObj.sseResponse.writableEnded) return;
    reconnecting = true;
    let recovered = false;
    try {
      if (scObj.keepaliveTimer) {
        clearInterval(scObj.keepaliveTimer);
        scObj.keepaliveTimer = null;
      }
      const curSession = session || [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (curSession && !curSession.isClosed && curSession.browser) {
        const pages = curSession.browser.pages().filter(p => !p.isClosed());
        const newPage = pages.includes(targetPage) ? targetPage
          : pages.includes(curSession.mainPage) ? curSession.mainPage : pages[0];
        if (newPage) {
          const newCdp = await curSession.browser.newCDPSession(newPage).catch(() => null);
          if (newCdp && attached && !scObj.cleaned) {
            await attachScreencastSession(scObj, newCdp, newPage, slot, curSession);
            recovered = true;
          } else if (newCdp) await newCdp.detach().catch(() => {});
        }
      }
    } catch {} finally {
      reconnecting = false;
    }
    // Không còn tab nào để nối lại: đóng kết nối để người xem thấy "đang kết nối lại" thay vì đứng hình im lặng.
    if (!recovered && attached && !scObj.cleaned) {
      try {
        scObj.sseResponse.end();
      } catch {}
    }
  };

  // CDPSession của Playwright phát 'close' khi phiên bị detach/target mất (không có sự kiện 'disconnect').
  cdpSession.on?.('close', onDetachOrClose);
  targetPage.on?.('close', onDetachOrClose);
  // 2. Gắn listener TRƯỚC KHI gọi startScreencast để không bao giờ bị lỡ frame đầu
  const onFrame = frame => {
    if (!attached) return;
    scObj.lastFrameTime = Date.now();
    if (frame.metadata) {
      scObj.deviceWidth = frame.metadata.deviceWidth;
      scObj.deviceHeight = frame.metadata.deviceHeight;
    }
    const res = scObj.sseResponse;
    if (scObj.cleaned || res.writableEnded || res.destroyed) return;
    // Chống nghẽn riêng từng slot: chỉ báo Chrome "đã nhận" khi socket người xem đẩy xong frame.
    // Người xem chậm (Telegram qua tunnel) thì Chrome tự giãn nhịp frame của slot đó,
    // không dồn frame trong RAM Node và không làm trễ các slot khác.
    const ack = () => cdpSession.send('Page.screencastFrameAck', {
      sessionId: frame.sessionId
    }).catch(() => {});
    if (res.write(`data: ${frame.data}\n\n`)) ack();else res.once('drain', ack);
  };
  cdpSession.on('Page.screencastFrame', onFrame);
  scObj.unbindListeners = () => {
    attached = false;
    cdpSession.off?.('Page.screencastFrame', onFrame);
    cdpSession.off?.('close', onDetachOrClose);
    targetPage.off?.('close', onDetachOrClose);
  };
  await cdpSession.send('Page.enable').catch(() => {});
  if (!attached || scObj.cleaned) return;

  // 3. Giữ kích thước tọa độ viewport; lấy một trong hai frame để giảm tải mã hóa và truyền ảnh.
  const vp = typeof targetPage?.viewportSize === 'function' ? targetPage.viewportSize() : null;
  const targetMaxWidth = Math.max(1280, vp?.width || 1280);
  const targetMaxHeight = Math.max(800, vp?.height || 800);
  await cdpSession.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 58,
    maxWidth: targetMaxWidth,
    maxHeight: targetMaxHeight,
    everyNthFrame: 2
  }).catch(err => {
    console.warn('[ScreenStream] Lỗi startScreencast:', err.message);
  });
  if (!attached || scObj.cleaned) return;

  // 4. Frame ban đầu chụp NỀN, không await, và KHÔNG chụp khi cửa sổ đang thu nhỏ (xem isWindowMinimized):
  // lệnh chụp treo sẽ chặn screencast của slot. Lúc đó screencast tự gửi frame đầu.
  // Bỏ fallback page.screenshot: nó cũng gọi captureScreenshot nên treo y như vậy.
  void isWindowMinimized(cdpSession).then(minimized => minimized || !attached ? null : cdpSession.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 58
  })).then(initShot => {
    const res = scObj.sseResponse;
    if (initShot?.data && attached && !scObj.cleaned && !res.writableEnded && !res.destroyed) {
      scObj.lastFrameTime = Date.now();
      res.write(`data: ${initShot.data}\n\n`);
    }
  }).catch(() => {});

  // 5. Trang tĩnh chỉ chụp bù sau 1,5 giây; các frame thay đổi vẫn tới qua screencast.
  // Ping kết nối tách khỏi tần suất chụp, tránh biến trang tĩnh thành luồng screenshot liên tục.
  let pingCounter = 0;
  scObj.keepaliveTimer = setInterval(async () => {
    if (!attached) return;
    if (scObj.cleaned || scObj.sseResponse.writableEnded || !scObj.page || scObj.page.isClosed()) {
      if (scObj.keepaliveTimer) {
        clearInterval(scObj.keepaliveTimer);
        scObj.keepaliveTimer = null;
      }
      return;
    }
    // Socket người xem còn đang đẩy frame cũ thì không chụp bù thêm (chống nghẽn riêng slot này).
    if (scObj.sseResponse.writableNeedDrain) return;

    // Gửi SSE comment ping mỗi 3s để chống timeout kết nối mạng/proxy
    pingCounter++;
    if (pingCounter >= 6) {
      pingCounter = 0;
      try {
        scObj.sseResponse.write(': ping\n\n');
      } catch {}
    }
    const now = Date.now();
    const idleTime = now - (scObj.lastFrameTime || 0);

    // Chỉ bù frame khi trang thực sự tĩnh quá 1,5 giây.
    if (idleTime >= 1500) {
      if (captureInFlight) return;
      captureInFlight = true;
      try {
        // Cửa sổ thu nhỏ: không chụp bù (lệnh chụp treo sẽ chặn screencast của slot này).
        if (await isWindowMinimized(cdpSession) || !attached) return;
        const shot = await cdpSession.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: 50
        });
        if (shot?.data && attached && !scObj.cleaned && !scObj.sseResponse.writableEnded) {
          scObj.lastFrameTime = Date.now();
          scObj.sseResponse.write(`data: ${shot.data}\n\n`);
        }
      } catch (err) {
        // Lỗi Playwright: "Target page, context or browser has been closed", "Session closed", "...detached".
        if (err?.message && /closed|detached/i.test(err.message)) {
          void onDetachOrClose();
        }
      } finally {
        captureInFlight = false;
      }
    }
  }, 500);
}
export { attachScreencastSession };
