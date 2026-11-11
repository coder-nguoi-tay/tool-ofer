import { getDeadOrBlockedReason } from "../page-health/get-dead-or-blocked-reason.mjs";

/**
 * Has traffic blocked.
 * @param {object} page page.
 * @return {Promise<*>} Kết quả xử lý has traffic blocked.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function hasTrafficBlocked(page) {
  const reason = await getDeadOrBlockedReason(page);
  return Boolean(reason);
}
