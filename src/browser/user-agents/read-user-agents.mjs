import { readFile } from 'node:fs/promises';
import { userAgentListPath } from "../../runtime/constants/user-agent-list-path.mjs";

/**
 * Đọc danh sách user-agent macOS đi kèm, chuyển từ Config/Browser/useragent Mac.txt.
 *
 * @return {Promise<string[]>} Danh sách user-agent, rỗng nếu không đọc được file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function readUserAgents() {
  try {
    const content = await readFile(userAgentListPath, 'utf8');
    return content.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('Mozilla/'));
  } catch {
    return [];
  }
}
