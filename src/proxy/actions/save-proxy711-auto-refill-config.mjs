import { proxy711AutoRefill } from '../../runtime/constants/proxy711-auto-refill.mjs';
import { proxy711AutoRefillConfigPath } from '../../runtime/constants/proxy711-auto-refill-config-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Save proxy711 auto refill config.
 * @return {Promise<void>} Kết quả xử lý save proxy711 auto refill config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function saveProxy711AutoRefillConfig() {
  await writeFile(proxy711AutoRefillConfigPath, JSON.stringify(proxy711AutoRefill)).catch(() => {});
}
