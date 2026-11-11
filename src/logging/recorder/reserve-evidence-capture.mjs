let activeCaptures = 0;

/**
 * Đặt chỗ chụp bằng chứng, tối đa hai tab toàn app; caller giữ nhóm sự kiện để thử lại khi hết chỗ.
 * @return {Function|null} Hàm trả chỗ đúng một lần hoặc null nếu hết chỗ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function reserveEvidenceCapture() {
  if (activeCaptures >= 2) return null;
  activeCaptures++;
  let released = false;
  return () => { if (!released) { released = true; activeCaptures--; } };
}
