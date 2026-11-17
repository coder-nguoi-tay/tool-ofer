// Bản giải riêng của offer 2615, chép từ src/autofill/offerwall/get-addept-offer-frame.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Tìm iframe offer Addept hiển thị trong placement của màn cuối SweepstakesAlerts.
 * @param {object} page Trang cha cần đọc, không truy cập các iframe tracking.
 * @return {Promise<object|null>} Placement và frame (có thể chưa tải), hoặc null ngoài màn cuối.
 * @throws {never} DOM thay đổi trong lúc đọc được bỏ qua để lượt sau thử lại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function getAddeptOfferFrame(page) {
  let element;
  try {
    if (!['sweepstakesalerts.com', 'www.sweepstakesalerts.com'].includes(new URL(page.url()).hostname)) return null;
    const progress = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--progressPercentage')));
    if (!(progress >= 98 && progress <= 100)) return null;
    const placement = page.locator('#ow-placement iframe[data-content-iframe]').first();
    if (!await placement.isVisible()) return null;
    const source = new URL(await placement.getAttribute('src'), page.url());
    if (source.protocol !== 'https:' || source.hostname !== 'sdk.scrptk.com' || source.pathname !== '/content/render') return null;
    element = await placement.elementHandle();
    return { frame: await element?.contentFrame() || null };
  } catch { return null; }
  finally { await element?.dispose().catch(() => {}); }
}
