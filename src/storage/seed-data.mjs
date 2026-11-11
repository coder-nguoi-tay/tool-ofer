import { access, mkdir, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { dataDirName, baseDataDirectory, instanceId } from '../config/paths.mjs';

/**
 * Nếu đang ở instance phụ (vd Bản 2) và file dữ liệu chưa có, sao chép file từ Bản 1 sang để dùng sẵn cấu hình.
 * @param {string} targetPath Đường dẫn file đích.
 * @param {string} sourceFileName Tên file mẫu trong instance chính.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function seedFileIfMissing(targetPath, sourceFileName) {
  if (dataDirName === 'AutoLeadPC') return;
  try {
    await access(targetPath);
  } catch {
    try {
      const sourcePath = join(baseDataDirectory, sourceFileName);
      await access(sourcePath);
      await mkdir(dirname(targetPath), {
        recursive: true
      });
      await cp(sourcePath, targetPath);
      console.log(`[Bản ${instanceId}] Đã khởi tạo dữ liệu mẫu từ ${sourceFileName}`);
    } catch {}
  }
}
