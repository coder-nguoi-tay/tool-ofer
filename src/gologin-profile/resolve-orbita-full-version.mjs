import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { executeFile } from '../runtime/constants/execute-file.mjs';

/**
 * Đọc số build đầy đủ của Orbita đã tải (vd. 152 → 152.0.7977.82) để UA khớp đúng engine sẽ chạy.
 * @param {string} majorVersion Số Chrome chính đã chọn cho profile.
 * @param {string} [browserRoot] Thư mục SDK GoLogin lưu các bản Orbita.
 * @return {Promise<string>} Phiên bản đầy đủ; bản chưa tải trả "<major>.0.0.0" (SDK sẽ tải ở lần mở này).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function resolveOrbitaFullVersion(majorVersion, browserRoot = join(homedir(), '.gologin', 'browser')) {
  if (process.platform === 'win32') {
    const binary = join(browserRoot, `orbita-browser-${majorVersion}`, 'chrome.exe');
    const { stdout } = await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-Item -LiteralPath $env:AUTOLEADPC_BROWSER_BINARY).VersionInfo.ProductVersion'], { env: { ...process.env, AUTOLEADPC_BROWSER_BINARY: binary } }).catch(() => ({ stdout: '' }));
    const version = stdout.trim();
    return version.startsWith(`${majorVersion}.`) ? version : `${majorVersion}.0.0.0`;
  }
  const plist = join(browserRoot, `orbita-browser-${majorVersion}`, 'Orbita-Browser.app', 'Contents', 'Info.plist');
  const text = await readFile(plist, 'utf8').catch(() => '');
  const version = text.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([\d.]+)<\/string>/)?.[1];
  return version?.startsWith(`${majorVersion}.`) ? version : `${majorVersion}.0.0.0`;
}
