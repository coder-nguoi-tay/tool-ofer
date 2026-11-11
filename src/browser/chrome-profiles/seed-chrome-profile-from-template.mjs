import { access } from 'node:fs/promises';
import { basename } from 'node:path';
import { chromeTemplateMetadataName } from '../chrome-paths.mjs';
import { chromeTemplateProfileDirectory } from '../chrome-paths.mjs';
import { chromeTemplateSkippedNames } from '../chrome-paths.mjs';
import { compareChromeVersions } from './compare-chrome-versions.mjs';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { roboFormExtensionId } from '../chrome-paths.mjs';

/**
 * Chép profile mẫu (đã cài RoboForm) vào thư mục profile Chrome mới tạo.
 *
 * Chỉ chép khi profile đích chưa từng được Chrome khởi tạo, để không ghi đè dữ liệu cũ.
 * Bỏ qua khi profile mẫu được tạo bằng Chrome mới hơn bản sắp mở, vì Chrome không hỗ trợ
 * mở profile của phiên bản mới hơn.
 *
 * @param {string} userDataDirectory Thư mục profile Chrome đích.
 * @param {{version: string}} build Bản Chrome sẽ mở profile đích.
 * @param {string} [templateProfileDirectory] Thư mục profile mẫu; mặc định dùng profile mẫu của app.
 * @return {Promise<string|null>} Null nếu đã chép, hoặc lý do không chép để hiện trên giao diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function seedChromeProfileFromTemplate(userDataDirectory, build, templateProfileDirectory = chromeTemplateProfileDirectory) {
  try {
    await access(join(userDataDirectory, 'Local State'));
    return 'profile này tạo trước khi có profile mẫu nên không được chép';
  } catch {
    // Profile chưa được Chrome khởi tạo nên có thể nhận dữ liệu mẫu.
  }
  let templateVersion;
  try {
    const metadata = JSON.parse(await readFile(join(templateProfileDirectory, chromeTemplateMetadataName), 'utf8'));
    templateVersion = metadata.chromeVersion;
    await access(join(templateProfileDirectory, 'Local State'));
  } catch {
    return 'chưa có profile mẫu; bấm "Cài RoboForm cho profile mới"';
  }
  try {
    await access(join(templateProfileDirectory, 'Default', 'Extensions', roboFormExtensionId));
  } catch {
    return 'profile mẫu chưa cài RoboForm';
  }
  if (compareChromeVersions(templateVersion, build.version) > 0) {
    return `profile mẫu tạo bằng Chrome ${templateVersion}, mới hơn Chrome ${build.version}`;
  }
  await cp(templateProfileDirectory, userDataDirectory, {
    recursive: true,
    filter: source => !chromeTemplateSkippedNames.has(basename(source))
  });
  return null;
}
export { seedChromeProfileFromTemplate };
