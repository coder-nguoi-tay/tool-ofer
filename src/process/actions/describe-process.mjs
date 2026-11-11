import { LSOF_PATHS } from '../../runtime/constants/lsof-paths.mjs';
import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { existsSync } from 'node:fs';

/**
 * Đọc lệnh chạy và thư mục làm việc của một tiến trình để xác định nó có phải máy chủ AutoLeadPC hay không.
 *
 * @param {number} pid PID cần kiểm tra.
 * @return {Promise<{command: string, workingDirectory: string}>} Lệnh chạy và thư mục làm việc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function describeProcess(pid) {
  let command = '';
  let workingDirectory = '';
  try {
    const {
      stdout
    } = await executeFile('/bin/ps', ['-o', 'command=', '-p', String(pid)], {
      timeout: 5000
    });
    command = String(stdout).trim();
  } catch {
    // Tiến trình có thể đã chết trước khi đọc được thông tin.
  }
  for (const lsofPath of LSOF_PATHS) {
    if (!existsSync(lsofPath)) continue;
    try {
      const {
        stdout
      } = await executeFile(lsofPath, ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        timeout: 5000
      });
      const cwdLine = String(stdout).split('\n').find(line => line.startsWith('n'));
      if (cwdLine) workingDirectory = cwdLine.slice(1);
    } catch {
      // Không đọc được cwd thì vẫn dựa vào lệnh chạy để quyết định.
    }
    break;
  }
  return {
    command,
    workingDirectory
  };
}
