import { initLeadIpStats } from "../../../lead-check.mjs";
import { leadIpStatsMap } from "../../../lead-check.mjs";
import { leadStatsPath } from "../../runtime/constants/lead-stats-path.mjs";
import { readFile } from 'node:fs/promises';

/**
 * Load lead stats.
 * @return {Promise<void>} Kết quả xử lý load lead stats.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadLeadStats() {
  try {
    const raw = JSON.parse(await readFile(leadStatsPath, 'utf8'));
    initLeadIpStats(raw);
    console.log(`[LeadStats] Đã tải ${leadIpStatsMap.size} IP có lead từ ${leadStatsPath}`);
  } catch {}
}
