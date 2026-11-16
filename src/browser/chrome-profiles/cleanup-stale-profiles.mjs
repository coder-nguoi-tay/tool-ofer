import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { chromeProfileCacheDirectory } from '../chrome-paths.mjs';
import { chromeProfileDirectory } from '../chrome-paths.mjs';
import { isManagedChromeProfilePath } from './is-managed-chrome-profile-path.mjs';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { readlink } from 'node:fs/promises';
import { rm } from 'node:fs/promises';

/**
 * Xóa tất cả session profiles không có Chrome đang dùng (startup cleanup + có thể gọi lại).
 * Kiểm tra SingletonLock: nếu không có lock → xóa ngay; nếu có lock nhưng PID trong lock đã chết → xóa.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function cleanupStaleProfiles() {
  let windowsCommandLines = '';
  if (process.platform === 'win32') {
    try {
      const { stdout } = await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(chrome|chromium|SunBrowser)\\.exe$' } | ForEach-Object { $_.CommandLine }"]);
      windowsCommandLines = stdout.toLowerCase();
    } catch { return; } // Không xác định được process thì giữ profile.
  }
  const roots = [chromeProfileDirectory, chromeProfileCacheDirectory];
  let removed = 0;
  for (const root of roots) {
    let channelDirs;
    try {
      channelDirs = await readdir(root);
    } catch {
      continue;
    }
    for (const channel of channelDirs) {
      const channelPath = join(root, channel);
      let versionDirs;
      try {
        versionDirs = await readdir(channelPath);
      } catch {
        continue;
      }
      for (const version of versionDirs) {
        const versionPath = join(channelPath, version);
        let profileDirs;
        try {
          profileDirs = await readdir(versionPath);
        } catch {
          continue;
        }
        for (const profileDir of profileDirs) {
          const profilePath = join(versionPath, profileDir);
          const lockPath = join(profilePath, 'SingletonLock');
          let hasActiveLock = process.platform === 'win32' && windowsCommandLines.includes(profilePath.toLowerCase());
          try {
            const lockTarget = await readlink(lockPath);
            // lockTarget = "hostname-PID"
            const pid = parseInt(lockTarget.split('-').pop(), 10);
            if (pid > 0) {
              try {
                process.kill(pid, 0);
                hasActiveLock = true;
              } catch {/* PID dead */}
            }
          } catch {/* no lock file */}
          if (!hasActiveLock && isManagedChromeProfilePath(profilePath)) {
            await rm(profilePath, {
              recursive: true,
              force: true
            }).catch(() => {});
            removed++;
          }
        }
      }
    }
  }
  if (removed > 0) console.log(`[Cleanup] Đã xóa ${removed} profile Chrome cũ không còn dùng.`);
}
export { cleanupStaleProfiles };
