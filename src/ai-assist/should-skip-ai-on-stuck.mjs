/**
 * Bỏ qua gọi AI khi tab "kẹt" ở trang không có form thật (trống, nội bộ, trang kiểm IP, link click toffers) hoặc vừa gọi
 * AI cho đúng URL này chưa tới 4 giây (chống gọi dồn theo từng tab). Dùng chung cho Chrome và GoLogin.
 * @param {object} page Tab Playwright đang kẹt; ghi lại URL/thời điểm gọi AI gần nhất trên tab.
 * @param {number} [now=Date.now()] Thời điểm hiện tại.
 * @return {boolean} True khi không nên gọi AI.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function shouldSkipAiOnStuck(page, now = Date.now()) {
  if (page._aiAssistRunning) return true;
  const url = page.url?.() || '';
  if (!url || url.startsWith('about:') || url.startsWith('chrome:') || url.includes('api.ipify.org') || url.includes('toffers.top/click')) return true;
  if (page._lastAiUrl === url && now - (page._lastAiTime || 0) < 4000) return true;
  page._lastAiUrl = url;
  page._lastAiTime = now;
  return false;
}
