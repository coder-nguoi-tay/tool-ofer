/**
 * Nhận cả đóng context và mất kết nối browser, nhưng chỉ dọn/bù phiên một lần.
 * @param {object} session Phiên Chrome hoặc AdsPower chứa context và kết nối CDP nếu có.
 * @param {Function} cleanupClosedSession Hàm dọn proxy/profile/relay và xếp hàng tự bù hiện có.
 * @return {void} Gắn callback vòng đời mà không tác động browser đang mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function attachBrowserCloseHandler(session, cleanupClosedSession) {
  let closureHandled = false;
  /**
   * Hợp nhất sự kiện đóng context và disconnect vào đúng một lần dọn phiên.
   * @return {*} Kết quả callback lần đầu hoặc undefined khi đã xử lý.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const handleSessionClosureOnce = () => {
    if (closureHandled) return;
    closureHandled = true;
    return cleanupClosedSession();
  };
  session.browser.on('close', handleSessionClosureOnce);
  const browserConnection = session._cdpBrowser || (typeof session.browser.browser === 'function' ? session.browser.browser() : null);
  browserConnection?.on?.('disconnected', handleSessionClosureOnce);
}
