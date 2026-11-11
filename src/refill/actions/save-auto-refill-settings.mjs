import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { autoRefillSettingsPath } from '../../runtime/constants/auto-refill-settings-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Save auto refill settings.
 * @return {Promise<void>} Kết quả xử lý save auto refill settings.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function saveAutoRefillSettings() {
  if (!autoRefill.settings) return;
  try {
    await writeFile(autoRefillSettingsPath, JSON.stringify({
      settings: autoRefill.settings,
      targetCount: autoRefill.targetCount,
      sequential: autoRefill.sequential
    }), 'utf8');
  } catch {}
}
