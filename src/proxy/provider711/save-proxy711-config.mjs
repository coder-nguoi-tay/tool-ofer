import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { appDataDirectory, getAutoLeadPCDir } from '../../config/paths.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { proxy711 } from './state/proxy711.mjs';
import { proxy711ConfigPath } from './state/proxy711-config-path.mjs';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';

/**
 * Lưu tài khoản và thiết lập 711Proxy vào JSON và Settings.ini trong dữ liệu người dùng.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveProxy711Config() {
  // Chỉ cho test lưu cấu hình khi đã chỉ định kho dữ liệu riêng.
  if (process.env.NODE_TEST_CONTEXT && !process.env.AUTOLEADPC_DATA_DIR) return;
  await writeFile(proxy711ConfigPath, JSON.stringify({
    username: proxy711.username,
    passwd: proxy711.passwd || '',
    token: proxy711.token,
    tokenExpiry: proxy711.tokenExpiry,
    wapiToken: proxy711.wapiToken || '',
    wapiTokenExpiry: proxy711.wapiTokenExpiry || 0,
    packageGb: proxy711.packageGb || 0,
    authMode: proxy711.authMode || 'subuser',
    subuser: proxy711.subuser || '',
    subpass: proxy711.subpass || '',
    gatewayHost: proxy711.gatewayHost || 'global.rotgbapi.trustsource.live',
    gatewayPort: proxy711.gatewayPort || 10000
  })).catch(() => {});

  // Resources trong .app phải giữ nguyên để chữ ký còn hợp lệ sau khi lưu cấu hình.
  try {
    const candidatePaths = [join(appDataDirectory, 'Config', 'Settings', 'Settings.ini')];
    // Test chỉ ghi vào dữ liệu instance đã cô lập, tránh sửa cấu hình PC đang dùng.
    if (!process.env.NODE_TEST_CONTEXT) {
      candidatePaths.push(join(getAutoLeadPCDir(), 'Config', 'Settings', 'Settings.ini'));
    }
    for (const iniPath of candidatePaths) {
      const dir = dirname(iniPath);
      if (!existsSync(dir)) mkdirSync(dir, {
        recursive: true
      });
      let text = existsSync(iniPath) ? readFileSync(iniPath, 'utf8') : '';
      const section = `[Proxy711]\nUsername=${proxy711.username}\nPasswd=${proxy711.passwd || ''}\nAuthMode=${proxy711.authMode || 'subuser'}\nSubuser=${proxy711.subuser || ''}\nSubpass=${proxy711.subpass || ''}\nGatewayHost=${proxy711.gatewayHost || 'global.rotgbapi.trustsource.live'}\nGatewayPort=${proxy711.gatewayPort || 10000}\n`;
      if (text.includes('[Proxy711]')) {
        text = text.replace(/\[Proxy711\][\s\S]*?(?=\n\[|$)/, section);
      } else {
        text = text.trim() ? `${text.trim()}\n\n${section}` : section;
      }
      writeFileSync(iniPath, text, 'utf8');
    }
  } catch {}
}
export { saveProxy711Config };
