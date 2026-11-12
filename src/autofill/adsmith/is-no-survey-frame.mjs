/**
 * Giới hạn quy tắc chọn No vào AS_IFRAME Adsmith của FinancialHelpFinder, placement 9235.
 * @param {object} frame Frame cần xác minh URL, trang cha và phần tử nhúng.
 * @return {Promise<boolean>} True chỉ cho iframe khảo sát được người dùng chỉ định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function isNoSurveyFrame(frame) {
  let element;
  try {
    const url = new URL(frame?.url?.() || '');
    if (!['www.adsmith.io', 'adsmith.io'].includes(url.hostname) || !/^\/forge\/v4\/?$/.test(url.pathname) || url.searchParams.get('plc') !== '9235') return false;
    const parent = frame.parentFrame?.();
    const parentUrl = new URL(parent?.url?.() || '');
    if (!['financialhelpfinder.com', 'www.financialhelpfinder.com', 'blog.financialhelpfinder.com'].includes(parentUrl.hostname)) return false;
    element = await frame.frameElement();
    return await element.getAttribute('id') === 'AS_IFRAME';
  } catch { return false; }
  finally { await element?.dispose().catch(() => {}); }
}
