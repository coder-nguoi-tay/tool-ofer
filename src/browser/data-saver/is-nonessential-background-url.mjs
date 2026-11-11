const backgroundHosts = ['vidoomy.com', 'connatix.com', 'anyclip.com', 'aniview.com', 'primis.tech', 'teads.tv', 'spotx.tv', 'spotxchange.com', 'hotjar.com', 'clarity.ms', 'fullstory.com', 'mouseflow.com', 'crazyegg.com', 'smartlook.com', 'luckyorange.com'];

/**
 * Nhận diện bên thứ ba chỉ phục vụ video quảng cáo hoặc ghi lại phiên, không phải API form.
 * Giữ tài nguyên cùng host của trang chính; không mở rộng sang mọi mạng affiliate/quảng cáo.
 * @param {string} url URL tài nguyên đang tải.
 * @param {string} pageUrl URL trang chính để bảo vệ tài nguyên của chính website.
 * @return {boolean} True khi có thể chặn script/API nền của dịch vụ đã biết.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function isNonessentialBackgroundUrl(url, pageUrl = '') {
  try {
    const resourceHost = new URL(url).hostname;
    const pageHost = pageUrl ? new URL(pageUrl).hostname : '';
    return backgroundHosts.some(host => (resourceHost === host || resourceHost.endsWith('.' + host)) && !(pageHost === host || pageHost.endsWith('.' + host)));
  } catch { return false; }
}
