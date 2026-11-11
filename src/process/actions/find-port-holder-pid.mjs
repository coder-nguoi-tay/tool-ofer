import { LSOF_PATHS } from '../../runtime/constants/lsof-paths.mjs';
import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { existsSync } from 'node:fs';

/**
 * Tìm PID của tiến trình đang giữ cổng TCP.
 *
 * @param {number} port Cổng cần kiểm tra.
 * @return {Promise<number|null>} PID của tiến trình giữ cổng, null nếu cổng trống.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function findPortHolderPid(port) {
  for (const lsofPath of LSOF_PATHS) {
    if (!existsSync(lsofPath)) continue;
    try {
      const {
        stdout
      } = await executeFile(lsofPath, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
        timeout: 5000
      });
      const pid = Number.parseInt(String(stdout).trim().split('\n')[0] ?? '', 10);
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) return pid;
    } catch {
      // lsof trả về code khác 0 khi không còn tiến trình nào giữ cổng.
    }
  }
  return null;
}
