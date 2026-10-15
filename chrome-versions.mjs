import { createWriteStream } from 'node:fs';
import { constants as fileConstants } from 'node:fs';
import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { arch, homedir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);
const chromeForTestingBaseUrl = 'https://googlechromelabs.github.io/chrome-for-testing';
const chromeForTestingDownloadOrigin = 'https://storage.googleapis.com';
const chromeForTestingDownloadPrefix = '/chrome-for-testing-public/';
const chromeVersionPattern = /^\d+\.\d+\.\d+\.\d+$/;
const maximumChromeVersions = 12;
const chromeBuildDirectory = join(
  homedir(),
  'Library',
  'Application Support',
  'AutoLeadPC',
  'chrome-builds',
);

/**
 * Gọi một file JSON của Chrome for Testing.
 *
 * @param {string} fileName Tên file trong endpoint Chrome for Testing.
 * @return {Promise<object>} Nội dung JSON đã phân tích.
 * @throws {Error} Khi Google trả về lỗi hoặc nội dung không phải JSON.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
async function fetchChromeForTestingJson(fileName) {
  const response = await fetch(chromeForTestingBaseUrl + '/' + fileName, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error('Không đọc được danh mục Chrome for Testing: HTTP ' + response.status + '.');
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Danh mục Chrome for Testing trả về dữ liệu không phải JSON.');
  }
}
/**
 * Chọn tên nền tảng Chrome for Testing theo CPU của máy đang chạy.
 *
 * @return {string} mac-arm64 trên Apple Silicon, mac-x64 trên Intel.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
export function chromeForTestingPlatform() {
  return arch() === 'arm64' ? 'mac-arm64' : 'mac-x64';
}

/**
 * So sánh hai version bốn số theo từng thành phần.
 *
 * @param {string} left Version bên trái.
 * @param {string} right Version bên phải.
 * @return {number} Số dương khi left mới hơn right.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
function comparePatchOrder(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 4; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

/**
 * Tính dải Chrome major cần tải: không lấy bản mới nhất, không lùi quá sâu vào bản cũ.
 *
 * @param {number} stableMajor Major của kênh Stable hiện tại do Google công bố.
 * @param {number} versionCount Số phiên bản muốn có.
 * @param {number} skipNewestMajors Số major mới nhất bị bỏ qua để tránh bản vừa phát hành.
 * @return {number[]} Danh sách major tăng dần.
 * @throws {Error} Khi major stable không hợp lệ hoặc số lượng ngoài giới hạn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
export function selectChromeMajors(stableMajor, versionCount, skipNewestMajors = 1) {
  if (!Number.isInteger(stableMajor) || stableMajor < 1) {
    throw new Error('Không đọc được Chrome major của kênh Stable.');
  }
  if (!Number.isInteger(versionCount) || versionCount < 2 || versionCount > maximumChromeVersions) {
    throw new Error('Số phiên bản Chrome phải là số nguyên từ 2 đến ' + maximumChromeVersions + '.');
  }
  if (!Number.isInteger(skipNewestMajors) || skipNewestMajors < 0 || skipNewestMajors > 5) {
    throw new Error('Số major mới nhất bị bỏ qua phải nằm trong khoảng 0–5.');
  }

  const newestMajor = stableMajor - skipNewestMajors;
  const oldestMajor = newestMajor - versionCount + 1;
  if (oldestMajor < 1) throw new Error('Dải phiên bản yêu cầu lùi xa hơn Chrome 1.');
  return Array.from({ length: versionCount }, (_, index) => oldestMajor + index);
}

/**
 * Lấy bản patch mới nhất của từng major trong danh mục Chrome for Testing.
 *
 * Danh mục tải từ Internet nên URL được kiểm origin và version được kiểm định dạng trước
 * khi dùng làm tên thư mục.
 *
 * @param {object} catalog Nội dung known-good-versions-with-downloads.json.
 * @param {number[]} majors Các major cần tìm.
 * @param {string} platform Nền tảng Chrome for Testing, ví dụ mac-arm64.
 * @return {{downloads: {major: number, version: string, url: string}[], unavailableMajors: number[]}} Bản tải được và major thiếu.
 * @throws {Error} Khi danh mục không đúng định dạng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
export function resolveChromeDownloads(catalog, majors, platform) {
  if (!Array.isArray(catalog?.versions)) throw new Error('Danh mục Chrome for Testing không đúng định dạng.');

  const downloads = [];
  const unavailableMajors = [];
  for (const major of majors) {
    let best = null;
    for (const entry of catalog.versions) {
      const version = String(entry?.version ?? '');
      if (!chromeVersionPattern.test(version) || Number(version.split('.')[0]) !== major) continue;
      const url = entry.downloads?.chrome?.find((download) => download.platform === platform)?.url;
      if (typeof url !== 'string') continue;
      let downloadUrl;
      try {
        downloadUrl = new URL(url);
      } catch {
        continue;
      }
      if (downloadUrl.origin !== chromeForTestingDownloadOrigin
          || !downloadUrl.pathname.startsWith(chromeForTestingDownloadPrefix)) continue;
      if (best && comparePatchOrder(version, best.version) <= 0) continue;
      best = { major, version, url: downloadUrl.href };
    }
    if (best) downloads.push(best);
    else unavailableMajors.push(major);
  }
  return { downloads, unavailableMajors };
}

/**
 * Liệt kê các bản Chrome for Testing đã tải về máy này.
 *
 * @return {Promise<{name: string, executablePath: string, version: string, major: number}[]>} Build theo major tăng dần.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
export async function listInstalledChromeVersions() {
  const platform = chromeForTestingPlatform();
  let entries;
  try {
    entries = await readdir(chromeBuildDirectory);
  } catch {
    return [];
  }

  const buildsByMajor = new Map();
  for (const version of entries) {
    if (!chromeVersionPattern.test(version)) continue;
    const executablePath = join(
      chromeBuildDirectory,
      version,
      'chrome-' + platform,
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    );
    try {
      if (!(await stat(executablePath)).isFile()) continue;
      await access(executablePath, fileConstants.X_OK);
    } catch {
      continue;
    }
    const major = Number(version.split('.')[0]);
    const existing = buildsByMajor.get(major);
    if (existing && comparePatchOrder(version, existing.version) <= 0) continue;
    buildsByMajor.set(major, { name: 'Chrome ' + major + ' for Testing', executablePath, version, major });
  }
  return [...buildsByMajor.values()].sort((left, right) => left.major - right.major);
}

/**
 * Tải các bản Chrome for Testing còn thiếu.
 *
 * Build chính thức của Google giữ engine, UA và Sec-CH-UA cùng phiên bản.
 *
 * @param {{versionCount?: number, skipNewestMajors?: number, onProgress?: Function}} options Số bản cần có và callback tiến độ.
 * @return {Promise<{builds: object[], downloadedVersions: string[], warnings: string[]}>} Build sau khi tải.
 * @throws {Error} Khi không gọi được danh mục Google hoặc giải nén thất bại.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export async function installChromeVersions({
  versionCount = 10,
  skipNewestMajors = 1,
  onProgress = () => {},
} = {}) {
  const platform = chromeForTestingPlatform();
  const stableVersions = await fetchChromeForTestingJson('last-known-good-versions.json');
  const stableMajor = Number(String(stableVersions?.channels?.Stable?.version ?? '').split('.')[0]);
  const majors = selectChromeMajors(stableMajor, versionCount, skipNewestMajors);

  const alreadyInstalled = await listInstalledChromeVersions();
  const installedMajors = new Set(alreadyInstalled.map((build) => build.major));
  const missingMajors = majors.filter((major) => !installedMajors.has(major));
  if (missingMajors.length === 0) {
    return { builds: alreadyInstalled, downloadedVersions: [], warnings: [] };
  }

  onProgress('Đang đọc danh mục Chrome for Testing cho ' + missingMajors.length + ' bản còn thiếu.');
  const catalog = await fetchChromeForTestingJson('known-good-versions-with-downloads.json');
  const { downloads, unavailableMajors } = resolveChromeDownloads(catalog, missingMajors, platform);

  const downloadedVersions = [];
  for (const download of downloads) {
    onProgress('Đang tải Chrome ' + download.version + ' (' + platform + ').');
    await downloadChromeBuild(download, platform);
    downloadedVersions.push(download.version);
  }

  return {
    builds: await listInstalledChromeVersions(),
    downloadedVersions,
    warnings: unavailableMajors.length > 0
      ? ['Google không còn bản ' + platform + ' cho Chrome major: ' + unavailableMajors.join(', ') + '.']
      : [],
  };
}

/**
 * Tải và giải nén một bản Chrome for Testing vào thư mục dữ liệu của app.
 *
 * @param {{version: string, url: string}} download Version và URL đã kiểm origin.
 * @param {string} platform Nền tảng Chrome for Testing.
 * @return {Promise<void>} Hoàn tất khi binary nằm đúng chỗ.
 * @throws {Error} Khi tải, giải nén hoặc binary sau giải nén không chạy được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
async function downloadChromeBuild(download, platform) {
  const temporaryDirectory = join(chromeBuildDirectory, '.tmp');
  const archivePath = join(temporaryDirectory, download.version + '.zip');
  const partialDirectory = join(chromeBuildDirectory, download.version + '.partial');
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });

  const response = await fetch(download.url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error('Tải Chrome ' + download.version + ' thất bại: HTTP ' + response.status + '.');
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));

  await executeFile('unzip', ['-q', '-o', archivePath, '-d', partialDirectory]);
  // Chỉ xoá file zip tạm do chính hàm này vừa tạo.
  await rm(archivePath, { force: true });

  const executablePath = join(
    partialDirectory,
    'chrome-' + platform,
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing',
  );
  await access(executablePath, fileConstants.X_OK);
  await rename(partialDirectory, join(chromeBuildDirectory, download.version));
}
