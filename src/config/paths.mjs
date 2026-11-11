import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
export const instanceId = process.env.AUTOLEADPC_INSTANCE || '1';
const instanceSuffix = instanceId !== '1' ? `-${instanceId}` : '';
export const dataDirName = process.env.AUTOLEADPC_DATA_DIR || `AutoLeadPC${instanceSuffix}`;
export const baseDataDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC');
export const appDataDirectory = join(homedir(), 'Library', 'Application Support', dataDirName);
/**
 * Xác định thư mục cấu hình AutoLeadPC của người dùng.
 * @return {string} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function getAutoLeadPCDir() {
  const custom = join(homedir(), '.autoleadpc');
  if (existsSync(custom)) return custom;
  return join(homedir(), 'Downloads', 'AutoLeadPC');
}
