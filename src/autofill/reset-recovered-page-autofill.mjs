/**
 * Gỡ khóa submit của trang vừa quay lại để tiếp tục form, giữ dữ liệu và cờ lead của phiên.
 * @param {object} page Tab đã phục hồi về trang trước.
 * @param {object} session Phiên có IP đã được xác nhận lead.
 * @return {Promise<void>} Hoàn tất reset trạng thái thao tác, không xóa giá trị input/đáp án.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function resetRecoveredPageAutofill(page, session) {
  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  await Promise.all(frames.map(frame => frame.evaluate(() => {
    const attributes = ['data-ux-submitted', 'data-ux-submit-count', 'data-ux-last-submit-time', 'data-ux-ai-done'];
    for (const element of document.querySelectorAll(attributes.map(name => `[${name}]`).join(','))) {
      for (const name of attributes) element.removeAttribute(name);
    }
  }).catch(() => {})));
  session.hasSubmittedCurrentScreen = false;
  session.answerClickPending = false;
  session.lastActiveScreenSignature = null;
  session._candidateScreenSignature = null;
  page._aiFormRepairRetry = null;
  page._lastAutofillWaitKey = null;
}
