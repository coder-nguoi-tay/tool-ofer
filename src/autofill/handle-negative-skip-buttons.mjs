/**
 * Phát hiện và tự động bấm nút bỏ qua / negative button trên các màn ưu đãi offerwall trung gian
 * để tiếp tục chuyển sang câu hỏi hoặc màn tiếp theo trong phễu (được huấn luyện từ log thực tế).
 *
 * @param {object} frame Frame Playwright đang quét.
 * @return {Promise<number>} Số lượng nút đã bấm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleNegativeSkipButtons(frame) {
  let skipped = 0;
  try {
    const skipSelector = ['button[data-element-type="negative_button"]', 'button.creative-button-negative', 'button.skip-btn', 'a.skip-btn', 'button.skip-button', 'button.ai-skip', 'a.ai-skip', 'button.skip-button-text', '[data-action="skip"]', 'button:has-text("No, I don\'t need extra money")', 'button:has-text("I don\'t want my gift")', 'button:has-text("No, Skip")', 'button:has-text("None/Skip")', 'button:has-text("No Thanks")', 'a:has-text("No Thanks")', 'button:has-text("Skip")'].join(', ');
    const buttons = await frame.locator(skipSelector).all();
    for (const btn of buttons) {
      if (!(await btn.isVisible().catch(() => false))) continue;
      const alreadyClicked = await btn.getAttribute('data-ux-clicked').catch(() => null);
      if (alreadyClicked === '1') continue;
      await btn.click({
        timeout: 1500,
        force: true
      }).catch(async () => {
        await btn.evaluate(b => b.click()).catch(() => {});
      });
      await btn.evaluate(b => {
        b.setAttribute('data-ux-clicked', '1');
      }).catch(() => {});
      skipped += 1;
      await new Promise(r => setTimeout(r, 400));
      break; // Chỉ bấm 1 nút skip mỗi lần quét
    }
  } catch {}
  return skipped;
}
export { handleNegativeSkipButtons };
