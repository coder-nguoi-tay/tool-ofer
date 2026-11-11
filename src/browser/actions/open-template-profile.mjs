import { applicationState } from '../../runtime/application-state.mjs';
import { chromeTemplateMetadataName } from '../chrome-paths.mjs';
import { chromeTemplateProfileDirectory } from '../chrome-paths.mjs';
import { chromium } from 'playwright';
import { compareChromeVersions } from '../chrome-profiles.mjs';
import { join } from 'node:path';
import { listInstalledChromeChannels } from '../chrome-installations.mjs';
import { listProfileExtensionNames } from '../chrome-profiles.mjs';
import { mkdir } from 'node:fs/promises';
import { navigationTimeout } from '../../runtime/constants/navigation-timeout.mjs';
import { readFile } from 'node:fs/promises';
import { roboFormExtensionId } from '../chrome-paths.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Mở profile mẫu không qua proxy để cài và đăng nhập RoboForm một lần.
 *
 * Profile mẫu dùng bản Chrome thấp nhất trên máy để mọi bản Chrome khác mở được bản chép.
 * Sau khi người dùng đóng cửa sổ này, mỗi profile Chrome mới tạo sẽ được chép từ nó.
 *
 * @return {Promise<{results: string[], warnings: string[]}>} Hướng dẫn cho người dùng.
 * @throws {Error} Khi không tìm thấy Chrome đã cài hoặc Chrome không khởi động được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function openTemplateProfile() {
  if (applicationState.templateProfileContext) {
    await applicationState.templateProfileContext.pages()[0]?.bringToFront().catch(() => {});
    return {
      results: ['Cửa sổ profile mẫu RoboForm đang mở.'],
      warnings: []
    };
  }
  const builds = await listInstalledChromeChannels();
  const build = builds.toSorted((first, second) => compareChromeVersions(first.version, second.version))[0];
  if (!build) throw new Error('Không tìm thấy Google Chrome từ bản 150 trở lên để mở profile mẫu.');
  await mkdir(chromeTemplateProfileDirectory, {
    recursive: true,
    mode: 0o700
  });
  let previousVersion;
  try {
    previousVersion = JSON.parse(await readFile(join(chromeTemplateProfileDirectory, chromeTemplateMetadataName), 'utf8')).chromeVersion;
  } catch {
    // Lần đầu tạo profile mẫu.
  }
  const warnings = previousVersion && compareChromeVersions(previousVersion, build.version) > 0 ? [`Profile mẫu từng mở bằng Chrome ${previousVersion}, mới hơn bản thấp nhất hiện có (${build.version}). ` + 'Nếu Chrome báo lỗi profile, xóa thư mục chrome-template-profile rồi cài lại RoboForm.'] : [];
  const context = await chromium.launchPersistentContext(chromeTemplateProfileDirectory, {
    executablePath: build.executablePath,
    ignoreDefaultArgs: ['--disable-extensions', '--disable-background-networking', '--disable-component-update'],
    headless: false,
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check']
  });
  const recordedVersion = previousVersion && compareChromeVersions(previousVersion, build.version) > 0 ? previousVersion : build.version;
  await writeFile(join(chromeTemplateProfileDirectory, chromeTemplateMetadataName), JSON.stringify({
    chromeVersion: recordedVersion
  }));
  applicationState.templateProfileContext = context;
  context.on('close', () => {
    if (applicationState.templateProfileContext === context) applicationState.templateProfileContext = null;
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`https://chromewebstore.google.com/detail/${roboFormExtensionId}`, {
    waitUntil: 'domcontentloaded',
    timeout: navigationTimeout
  }).catch(() => {});
  await page.bringToFront().catch(() => {});
  const templateExtensionNames = await listProfileExtensionNames(chromeTemplateProfileDirectory);
  if (templateExtensionNames.length > 0) {
    warnings.push(`Profile mẫu đang có extension: ${templateExtensionNames.join(', ')}. ` + 'Kiểm tra đã đăng nhập rồi đóng cửa sổ.');
  }
  return {
    results: [`Đã mở profile mẫu bằng Chrome ${build.version} (không qua proxy).`, 'Bấm "Thêm vào Chrome" để cài RoboForm, đăng nhập RoboForm, rồi đóng cửa sổ này.', 'Profile mới trên mọi phiên bản Chrome do app quản lý (Chrome 150 trở lên) sẽ được chép kèm RoboForm. Profile đã tạo trước đây không thay đổi.'],
    warnings
  };
}
