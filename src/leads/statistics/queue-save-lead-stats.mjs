import { appDataDirectory } from "../../config/paths.mjs";
import { applicationState } from "../../runtime/application-state.mjs";
import { leadIpStatsMap } from "../../../lead-check.mjs";
import { leadStatsPath } from "../../runtime/constants/lead-stats-path.mjs";
import { mkdir } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';

/**
 * Queue save lead stats.
 * @return {void} Kết quả xử lý queue save lead stats.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function queueSaveLeadStats() {
  if (applicationState.saveLeadStatsTimer) return;
  applicationState.saveLeadStatsTimer = setTimeout(async () => {
    applicationState.saveLeadStatsTimer = null;
    try {
      const data = Object.fromEntries(leadIpStatsMap);
      await mkdir(appDataDirectory, {
        recursive: true
      });
      await writeFile(leadStatsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[LeadStats] Lỗi khi lưu lead-stats.json:', err.message);
    }
  }, 500);
}
