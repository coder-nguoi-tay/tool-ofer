/**
 * Đẩy cửa sổ ra ngoài màn hình rồi thu nhỏ để chạy ngầm trong app.
 * Chrome mới từ chối gộp windowState 'minimized' với left/top trong một lệnh
 * ("cannot be combined with 'left', 'top'...") nên cửa sổ cứ hiện ra Desktop; phải tách hai lệnh.
 *
 * @param {object} cdpSession Phiên CDP của tab trong cửa sổ.
 * @param {number} windowId ID cửa sổ từ Browser.getWindowForTarget.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function hideWindowOffscreen(cdpSession, windowId) {
  await cdpSession.send('Browser.setWindowBounds', {
    windowId,
    bounds: {
      left: -20000,
      top: -20000
    }
  }).catch(() => {});
  await cdpSession.send('Browser.setWindowBounds', {
    windowId,
    bounds: {
      windowState: 'minimized'
    }
  });
}
