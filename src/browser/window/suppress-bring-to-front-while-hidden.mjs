import { activeBrowsers } from "../sessions.mjs";

/**
 * Khi chạy ngầm trong app, chặn page.bringToFront(): macOS 14+ không cho app nền giành focus nên mỗi lần gọi
 * làm icon Chrome nảy trên Dock và máy giật. Nhập liệu qua CDP vẫn chạy khi tab không được focus.
 * Cửa sổ được "Hiện" (session.isWindowVisible = true) thì bringToFront chạy như cũ.
 *
 * @param {object} context BrowserContext của phiên.
 * @param {object} session Phiên đang chạy (runHidden, isWindowVisible).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function suppressBringToFrontWhileHidden(context, session) {
  const guard = page => {
    if (!page || page._uxFrontGuard) return;
    page._uxFrontGuard = true;
    const original = page.bringToFront.bind(page);
    page.bringToFront = () => {
      // Khi chạy đa trình duyệt (nhiều cửa sổ song song) hoặc chạy ngầm trong app:
      // Chặn bringToFront cướp focus hệ điều hành để các cửa sổ không đè lên nhau,
      // không gửi sự kiện blur làm gián đoạn ô nhập và dropdown của các luồng khác.
      if (session.runHidden || activeBrowsers && activeBrowsers.size > 1 || session.isWindowVisible !== true) {
        return Promise.resolve();
      }
      return original();
    };
  };
  context.pages().forEach(guard);
  context.on('page', guard);
}
