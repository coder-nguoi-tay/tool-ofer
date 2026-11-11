import { proxy711AutoRefill } from '../../runtime/constants/proxy711-auto-refill.mjs';
import { proxy711AutoRefillConfigPath } from '../../runtime/constants/proxy711-auto-refill-config-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Load proxy711 auto refill config.
 * @return {Promise<void>} Kết quả xử lý load proxy711 auto refill config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadProxy711AutoRefillConfig() {
  try {
    const d = JSON.parse(await readFile(proxy711AutoRefillConfigPath, 'utf8'));
    if (typeof d.enabled === 'boolean') proxy711AutoRefill.enabled = d.enabled;
    if (typeof d.region === 'string') proxy711AutoRefill.region = d.region;
    if (typeof d.count === 'number') proxy711AutoRefill.count = d.count;
    if (typeof d.sessTime === 'number') proxy711AutoRefill.sessTime = d.sessTime;
    if (typeof d.sessAuto === 'boolean') proxy711AutoRefill.sessAuto = d.sessAuto;
  } catch {}
}
