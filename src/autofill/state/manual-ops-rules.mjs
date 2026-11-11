import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const manualOpsRules = (() => {
  try {
    const rulesPath = join(process.env.HOME || '', 'Library', 'Application Support', 'AutoLeadPC-2', 'logs', 'manual-ops-rules.json');
    if (existsSync(rulesPath)) {
      const parsed = JSON.parse(readFileSync(rulesPath, 'utf8'));
      const freshWithin30Days = Date.now() - new Date(parsed.updatedAt || 0).getTime() < 30 * 24 * 3600 * 1000;
      if (freshWithin30Days && parsed.rules) {
        console.log(`[ManualOpsRules] Đã nạp luật từ phân tích thao tác tay (${parsed.updatedAt}).`);
        return parsed.rules;
      }
    }
  } catch {}
  return null;
})();
export { manualOpsRules };
