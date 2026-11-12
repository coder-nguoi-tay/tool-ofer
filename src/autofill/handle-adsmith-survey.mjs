import { handleRadioAndSurveyOptions } from './handle-radio-and-survey-options.mjs';
import { isNoSurveyFrame } from './adsmith/is-no-survey-frame.mjs';
/**
 * Xử lý khảo sát co-reg "adsmith forge" (#AS_SURVEY iframe):
 * - Ở trang cha: click chuột thật vào tâm iframe để focus (bước "bấm vào frame").
 * - Bên trong iframe: mỗi lượt trả lời 1 nhóm câu hỏi (radio/checkbox, random),
 *   sau đó click thật nút Continue/Next/Submit bên trong.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function handleAdsmithSurvey(page, frame, options = {}) {
  if (!frame || typeof frame.url !== 'function') return 0;
  // Iframe có quy tắc No do handler riêng điều khiển; không click focus bằng tọa độ lên đáp án.
  for (const surveyFrame of page.frames()) if (await isNoSurveyFrame(surveyFrame)) return 0;
  const frameUrl = frame.url() || '';
  const parentUrl = typeof page.url === 'function' ? page.url() : '';
  const now = Date.now();

  // Step 1: trang cha có #AS_IFRAME → click chuột thật vào tâm iframe (focus vào frame)
  if (frameUrl === parentUrl || page.frames().length > 0) {
    // Mỗi trang cha chỉ focus tối đa 3 lần, log lần đầu: log 2026-11-12 click lặp mỗi 6s suốt 5 phút khi
    // khảo sát trong iframe không tiến triển, vừa nhiễu log vừa bị tính là "có thao tác" che dấu việc kẹt.
    const focusState = page._uxAsFrameFocus?.url === parentUrl ? page._uxAsFrameFocus : (page._uxAsFrameFocus = { url: parentUrl, count: 0 });
    if (focusState.count < 3 && (!page._uxAsFrameClickedAt || now - page._uxAsFrameClickedAt > 5000)) {
      try {
        const iframeLoc = frame.locator('#AS_IFRAME, #AS_SURVEY iframe').first();
        const visible = await iframeLoc.isVisible().catch(() => false);
        if (visible) {
          const box = await iframeLoc.boundingBox().catch(() => null);
          if (box && box.width > 10 && box.height > 10) {
            await page.mouse.click(box.x + box.width / 2, box.y + Math.min(40, box.height / 2), {
              delay: 30
            });
            page._uxAsFrameClickedAt = now;
            focusState.count += 1;
            if (focusState.count === 1) {
              options.onLog?.({
                type: 'as_frame_focus',
                detail: `[AS Survey] Đã click chuột thật vào #AS_IFRAME để focus frame khảo sát.`
              });
            }
            return 1;
          }
        }
      } catch {}
    }
  }

  // Step 2: đang ở bên trong frame adsmith → trả lời 1 nhóm câu hỏi mỗi lượt
  if (!frameUrl.includes('adsmith.io')) return 0;
  if (frame._uxAsHandledAt && now - frame._uxAsHandledAt < 2000) return 0;
  frame._uxAsHandledAt = now;
  const answered = await handleRadioAndSurveyOptions(frame, options.record || {}, null);
  if (answered) options.onLog?.({ type: 'as_answered', detail: `Đã xác minh ${answered} lựa chọn trong iframe Adsmith.` });
  return answered;
}
export { handleAdsmithSurvey };
