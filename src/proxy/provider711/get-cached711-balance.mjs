import { moduleState } from './state/module-state.mjs';

/**
 * Lấy số dư 711Proxy đã được cập nhật gần nhất.
 * @return {object} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getCached711Balance() {
  return moduleState.cached711Balance;
}
export { getCached711Balance };
