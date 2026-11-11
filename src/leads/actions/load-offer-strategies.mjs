import { getAutoLeadPCDir } from '../../config/paths.mjs';
import { join } from 'node:path';
import { offerStrategyState } from '../../runtime/constants/offer-strategy-state.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Nạp chiến lược đã lưu trước khi khôi phục phiên tự bù sau khi mở ứng dụng.
 *
 * @return {Promise<void>} Hoàn tất cập nhật bản đồ chiến lược.
 * @throws {never} File thiếu hoặc sai định dạng được bỏ qua an toàn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadOfferStrategies() {
  try {
    const path = join(getAutoLeadPCDir(), 'Config', 'Offer', 'offer-methods.json');
    const methods = JSON.parse(await readFile(path, 'utf8'));
    if (!Array.isArray(methods)) return;
    offerStrategyState.clear();
    for (const item of methods) {
      const number = Number(item?.offerNumber);
      if (!Number.isInteger(number) || number < 1 || number > 30) continue;
      offerStrategyState.set(number, {
        mode: ['auto_full', 'consent_only', 'manual', 'skip'].includes(item.mode) ? item.mode : 'auto_full',
        autoSubmit: item.autoSubmit !== false,
        maxPick: Number.isInteger(Number(item.maxPick)) && Number(item.maxPick) > 0 ? Number(item.maxPick) : null,
        pickRandom: item.pickRandom === true,
        notes: String(item.notes || ''),
        link: String(item.link || '').trim()
      });
    }
  } catch {
    // Cấu hình offer chưa được lưu lần đầu.
  }
}
