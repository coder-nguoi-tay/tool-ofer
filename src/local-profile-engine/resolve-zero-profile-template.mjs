import { __dirname } from './state/--dirname.mjs';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Tìm thư mục zero_profile template được trích xuất từ bản AutoLeadPC PC gốc.
 *
 * @return {string|null} Đường dẫn thư mục template hoặc null nếu chưa có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function resolveZeroProfileTemplate() {
  const candidates = [join(__dirname, 'Config', 'Browser', 'zero_profile'), join(homedir(), '.autoleadpc', 'Config', 'Browser', 'zero_profile'), join(homedir(), 'Downloads', 'AutoLeadPC', 'Config', 'Browser', 'zero_profile-extracted')];
  for (const c of candidates) {
    if (existsSync(join(c, 'Default', 'Preferences'))) return c;
  }
  return null;
}
export { resolveZeroProfileTemplate };
