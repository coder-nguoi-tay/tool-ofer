import { queueSaveLeadStats } from "./queue-save-lead-stats.mjs";
import { recordLeadIpStats } from "../../../lead-check.mjs";

/**
 * Save and record lead ip stats.
 * @param {*} entry entry.
 * @return {*} Kết quả xử lý save and record lead ip stats.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function saveAndRecordLeadIpStats(entry) {
  const res = recordLeadIpStats(entry);
  if (res) queueSaveLeadStats();
  return res;
}
