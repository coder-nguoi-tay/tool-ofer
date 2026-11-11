/**
 * Mở DevTools Elements bằng CDP cấp browser cho đúng tab hiện tại.
 * @param {object} page Tab Chrome/SunBrowser đang được xem trong app.
 * @return {Promise<boolean>} True nếu engine tạo được cửa sổ DevTools; false để UI hiện HTML.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function openPageDevtools(page) {
  let pageClient, browserClient;
  try {
    const context = page.context();
    const browser = context.browser();
    if (!browser) return false;
    pageClient = await context.newCDPSession(page);
    const { targetInfo } = await pageClient.send('Target.getTargetInfo');
    browserClient = await browser.newBrowserCDPSession();
    await browserClient.send('Target.openDevTools', { targetId: targetInfo.targetId, panelId: 'elements' });
    return true;
  } catch { return false; }
  finally {
    await pageClient?.detach().catch(() => {});
    await browserClient?.detach().catch(() => {});
  }
}
