import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isManagedChromeProfilePath } from '../../browser/chrome-profiles/is-managed-chrome-profile-path.mjs';

const executeNativeFile = promisify(execFile);

/**
 * Thực thi tiện ích hệ thống, dùng PowerShell và Explorer cho các thao tác trên Windows.
 * @param {string} command Tiện ích cần chạy.
 * @param {string[]} [args=[]] Tham số đã tách, không qua shell.
 * @param {object} [options={}] Tùy chọn tiến trình.
 * @return {Promise<{stdout: string, stderr: string}>} Kết quả tiện ích.
 * @throws {Error} Khi tiện ích thất bại hoặc không tìm thấy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function executePlatformFile(command, args = [], options = {}) {
  if (process.platform !== 'win32') return executeNativeFile(command, args, options);
  const configuration = { ...options, windowsHide: true };
  if (command === 'open') return executeNativeFile('explorer.exe', args, configuration);
  if (command === 'pkill') {
    // Chỉ dừng Chrome trong kho profile của app; tuyệt đối không taskkill theo tên chrome.exe.
    const { stdout } = await executePlatformFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(chrome|chromium|SunBrowser)\\.exe$' } | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress"], configuration);
    const processes = JSON.parse(stdout.trim() || '[]');
    const pattern = new RegExp(args.at(-1));
    for (const browser of [].concat(processes || [])) {
      const profilePath = browser.CommandLine?.match(/--user-data-dir(?:=|\s+)(?:"([^"]+)"|([^\s]+))/)?.slice(1).find(Boolean);
      if (!profilePath || !isManagedChromeProfilePath(profilePath) || !pattern.test(browser.CommandLine)) continue;
      await executeNativeFile('taskkill.exe', ['/PID', String(browser.ProcessId), '/T', '/F'], configuration).catch(() => {});
    }
    return { stdout: '', stderr: '' };
  }
  let script;
  let environment = { ...process.env, ...options.env };
  if (command === 'pbpaste') {
    script = '[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); [Console]::Write((Get-Clipboard -Raw))';
  } else if (command === 'unzip') {
    environment.AUTOLEADPC_ARCHIVE = args[args.indexOf('-o') + 1];
    environment.AUTOLEADPC_DESTINATION = args[args.indexOf('-d') + 1];
    script = 'Expand-Archive -LiteralPath $env:AUTOLEADPC_ARCHIVE -DestinationPath $env:AUTOLEADPC_DESTINATION -Force';
  } else if (command === 'zip') {
    environment.AUTOLEADPC_ARCHIVE = args[2];
    environment.AUTOLEADPC_ARCHIVE_FILES = JSON.stringify(args.slice(3));
    script = 'Compress-Archive -LiteralPath @($env:AUTOLEADPC_ARCHIVE_FILES | ConvertFrom-Json) -DestinationPath $env:AUTOLEADPC_ARCHIVE -Force';
  }
  if (script) return executeNativeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; ${script}`], { ...configuration, env: environment });
  return executeNativeFile(command, args, configuration);
}
