const { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, constants } = require('node:fs');
const { join } = require('node:path');

/**
 * Nạp cấu hình từ gói riêng tư đúng một lần, giữ nguyên mọi file đã có trên máy Windows.
 * @param {string} sourceDirectory Thư mục dữ liệu riêng tư đi kèm bundle.
 * @param {string} applicationDataDirectory Kho dữ liệu của instance Windows.
 * @param {string} commonConfigDirectory Kho cấu hình dùng chung AutoLeadPC trên Windows.
 * @return {number} Số file cấu hình đã khởi tạo.
 * @throws {Error} Khi dữ liệu đi kèm có symlink hoặc không thể ghi cấu hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function importBundledSettings(sourceDirectory, applicationDataDirectory, commonConfigDirectory) {
  const importMarker = join(applicationDataDirectory, 'imported-private-settings.json');
  if (!existsSync(sourceDirectory) || existsSync(importMarker)) return 0;
  let copiedFiles = 0;
  /**
   * Sao chép cây cấu hình riêng tư mà không ghi đè file đích hoặc đi theo symlink.
   * @param {string} source Thư mục nguồn thuộc bundle.
   * @param {string} destination Thư mục đích trên máy nhận.
   * @return {void} Hoàn tất sao chép các file còn thiếu.
   * @throws {Error} Khi có symlink hoặc thao tác filesystem thất bại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-16
   */
  function copyMissingConfiguration(source, destination) {
    if (!existsSync(source)) return;
    mkdirSync(destination, { recursive: true, mode: 0o700 });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Gói cấu hình không được chứa symlink.');
      const target = join(destination, entry.name);
      if (entry.isDirectory()) copyMissingConfiguration(join(source, entry.name), target);
      else if (entry.isFile()) {
        try {
          copyFileSync(join(source, entry.name), target, constants.COPYFILE_EXCL);
          copiedFiles += 1;
        } catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
    }
  }
  copyMissingConfiguration(join(sourceDirectory, 'instance'), applicationDataDirectory);
  copyMissingConfiguration(join(sourceDirectory, 'common'), commonConfigDirectory);
  mkdirSync(applicationDataDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(importMarker, JSON.stringify({ importedAt: new Date().toISOString(), copiedFiles }), { mode: 0o600 });
  return copiedFiles;
}

module.exports = { importBundledSettings };
