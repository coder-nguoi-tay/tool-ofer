// Bản giải riêng của offer 2615, chép từ src/autofill/offerwall/open-card-link-in-new-tab.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Mở link card trong tab cùng context, không chờ tải xong để tab chậm không chặn các card sau.
 * @param {object} page Trang card gốc.
 * @param {string} destination URL offer đã qua bộ lọc và khóa chống trùng.
 * @param {Function} isCancelled Kiểm tra Stop/lead sau khi tạo tab bất đồng bộ.
 * @return {Promise<boolean>} True khi đã tạo tab và bắt đầu điều hướng, kể cả trang đích lỗi tải.
 * @throws {Error} Khi context không tạo được tab; caller nhả khóa để thử lại sau.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function openCardLinkInNewTab(page, destination, isCancelled = () => false) {
  const child = await page.context().newPage();
  if (child.isClosed()) return false;
  if (isCancelled()) {
    child._uxClosedByApp = 'hủy mở offer trước điều hướng';
    await child.close().catch(() => {});
    return false;
  }
  const source = new URL(page.url());
  const referer = new URL(destination).origin === source.origin ? source.href : `${source.origin}/`;
  void child.goto(destination, { referer, timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
  return true;
}
