/**
 * Tạo trang form cục bộ để test scoping và scroll không truy cập website thật.
 * @param {object} browser Chromium Playwright đang chạy.
 * @param {string} html Nội dung form và các nút phụ cần kiểm thử.
 * @return {Promise<object>} Context, page và session sẵn sàng quét.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function createFormScopeFixture(browser, html) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  const page = await context.newPage();
  await page.goto('https://form-scope.test/registration');
  const session = { lastObservedUrl: page.url(), firstSubmitHandled: true, completedScreens: 1, autofillFields: 0 };
  return { context, page, session };
}
