import { Readable } from 'node:stream';
import { access } from 'node:fs/promises';
import { chromeBuildDirectory } from './state/chrome-build-directory.mjs';
import { createWriteStream } from 'node:fs';
import { executeFile } from './state/execute-file.mjs';
import { constants as fileConstants } from 'node:fs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { rename } from 'node:fs/promises';
import { rm } from 'node:fs/promises';

/**
 * Tải và giải nén một bản Chrome for Testing vào thư mục dữ liệu của app.
 *
 * @param {{version: string, url: string}} download Version và URL đã kiểm origin.
 * @param {string} platform Nền tảng Chrome for Testing.
 * @return {Promise<void>} Hoàn tất khi binary nằm đúng chỗ.
 * @throws {Error} Khi tải, giải nén hoặc binary sau giải nén không chạy được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function downloadChromeBuild(download, platform) {
  const temporaryDirectory = join(chromeBuildDirectory, '.tmp');
  const archivePath = join(temporaryDirectory, download.version + '.zip');
  const partialDirectory = join(chromeBuildDirectory, download.version + '.partial');
  await mkdir(temporaryDirectory, {
    recursive: true,
    mode: 0o700
  });
  const response = await fetch(download.url, {
    redirect: 'follow'
  });
  if (!response.ok || !response.body) {
    throw new Error('Tải Chrome ' + download.version + ' thất bại: HTTP ' + response.status + '.');
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));
  await executeFile('unzip', ['-q', '-o', archivePath, '-d', partialDirectory]);
  // Chỉ xoá file zip tạm do chính hàm này vừa tạo.
  await rm(archivePath, {
    force: true
  });
  const executablePath = join(partialDirectory, 'chrome-' + platform, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
  await access(executablePath, fileConstants.X_OK);
  await rename(partialDirectory, join(chromeBuildDirectory, download.version));
}
export { downloadChromeBuild };
