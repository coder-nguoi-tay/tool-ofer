import { appDataDirectory } from '../../config/paths.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { autofillQueuePath } from '../../runtime/constants/autofill-queue-path.mjs';
import { homedir } from 'node:os';
import { importAutofillRecords } from './import-autofill-records.mjs';
import { join } from 'node:path';
import { parseAutofillRecords } from '../../../autofill.mjs';
import { readFile } from 'node:fs/promises';
import { saveAutofillQueue } from './save-autofill-queue.mjs';
import { seedFileIfMissing } from '../../storage/seed-data.mjs';

/**
 * Nạp hàng đợi autofill từ file.
 * @return {Promise<void>} Kết quả xử lý load autofill queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadAutofillQueue() {
  await seedFileIfMissing(autofillQueuePath, 'autofill-queue.json');
  try {
    const data = JSON.parse(await readFile(autofillQueuePath, 'utf8'));
    autofillQueue.available = Array.isArray(data.available) ? data.available : [];
    autofillQueue.used = Array.isArray(data.used) ? data.used : [];
  } catch {/* file chưa tồn tại */}

  // Tự động nạp từ Config/Info/info.txt hoặc file JSON tải về nếu hàng đợi rỗng
  if (autofillQueue.available.length === 0 && autofillQueue.used.length === 0) {
    const candidateFiles = [join(appDataDirectory, 'Config', 'Info', 'info.txt'), join(process.cwd(), 'Config', 'Info', 'info.txt'), join(homedir(), 'Downloads', 'json_full_da_loai_zipcode_4_ky_tu.json'), join(homedir(), 'Downloads', 'du_lieu_chuyen_doi.json')];
    for (const filePath of candidateFiles) {
      try {
        const raw = await readFile(filePath, 'utf8');
        if (raw && raw.trim()) {
          const parsed = parseAutofillRecords(raw);
          if (parsed && parsed.length > 0) {
            importAutofillRecords(parsed);
            await saveAutofillQueue();
            console.log(`[AutofillQueue] Đã tự động nạp ${parsed.length} bản ghi thông tin từ ${filePath}`);
            break;
          }
        }
      } catch {}
    }
  }
}
