const DEFAULT_CLOSE_TIMEOUT_MS = 2_000;

/**
 * Đóng tab phụ trong thờigian giới hạn để thao tác dọn dẹp không khóa luồng mở trình duyệt.
 *
 * @param {object} page Tab Playwright cần đóng.
 * @param {number} [timeoutMs=2000] Thờigian chờ tối đa một lệnh đóng.
 * @return {Promise<void>} Hoàn tất khi tab đóng, đóng lỗi hoặc hết thờigian chờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function closePageBestEffort(page, timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => page.close()).catch(() => {}),
      new Promise(resolve => {
        timer = setTimeout(resolve, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
