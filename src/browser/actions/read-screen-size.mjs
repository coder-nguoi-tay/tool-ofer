import { bottomInset } from '../../runtime/constants/bottom-inset.mjs';
import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { fallbackScreen } from '../../runtime/constants/fallback-screen.mjs';
import { minimumWindow } from '../../runtime/constants/minimum-window.mjs';

/**
 * Đọc kích thước màn hình để chia lưới cửa sổ trên macOS và Windows.
 *
 * @return {Promise<{width: number, height: number}>} Kích thước màn hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function readScreenSize() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; "$($area.Width),$($area.Height)"']);
      const [width, height] = stdout.trim().split(',').map(Number);
      if (width > 0 && height > 0) return { width, height };
    }
    const {
      stdout
    } = await executeFile('osascript', ['-e', 'tell application "Finder" to get bounds of window of desktop']);
    const [,, width, height] = stdout.split(',').map(part => Number(part.trim()));
    if (width > 0 && height > 0) {
      return {
        width,
        height: Math.max(minimumWindow.height, height - bottomInset)
      };
    }
  } catch {
    // Finder không trả lời (chưa cấp quyền Automation chẳng hạn) thì dùng mặc định.
  }
  return {
    ...fallbackScreen,
    height: fallbackScreen.height - bottomInset
  };
}
