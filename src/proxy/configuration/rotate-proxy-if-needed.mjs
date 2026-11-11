/**
 * Tự động đổi IP cho proxy nếu có resetUrl (định dạng của proxyHung, proxy xoay: host:port|phút|resetUrl).
 * Gửi HTTP GET đến resetUrl và chờ IP mới cập nhật trước khi mở trình duyệt.
 *
 * @param {object} proxy Cấu hình proxy.
 * @return {Promise<boolean>} True nếu gọi reset thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function rotateProxyIfNeeded(proxy) {
  if (!proxy || !proxy.resetUrl) return false;
  console.log(`[ProxyRotate] Gọi reset URL đổi IP cho ${proxy.server}: ${proxy.resetUrl}`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(proxy.resetUrl, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    const resultText = (await response.text()).trim();
    console.log(`[ProxyRotate] Phản hồi reset URL (${response.status}):`, resultText);
    // Chờ 3.5s để proxy provider hoàn tất xoay IP mới
    await new Promise(resolve => setTimeout(resolve, 3500));
    return true;
  } catch (error) {
    console.warn(`[ProxyRotate] Lỗi gọi reset URL ${proxy.resetUrl}: ${error.message}`);
    return false;
  }
}
export { rotateProxyIfNeeded };
