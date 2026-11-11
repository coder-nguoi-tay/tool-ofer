import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appDataDirectory, getAutoLeadPCDir } from '../../config/paths.mjs';
import { join } from 'node:path';
import { proxy711 } from './state/proxy711.mjs';
import { proxy711ConfigPath } from './state/proxy711-config-path.mjs';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { seedFileIfMissing } from '../../storage/seed-data.mjs';

/**
 * Nạp tài khoản và thiết lập kết nối 711Proxy của instance.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadProxy711Config() {
  await seedFileIfMissing(proxy711ConfigPath, '711proxy-config.json');
  try {
    const d = JSON.parse(await readFile(proxy711ConfigPath, 'utf8'));
    if (d.username) proxy711.username = d.username;
    if (d.passwd) proxy711.passwd = d.passwd;
    if (d.token) proxy711.token = d.token;
    if (d.tokenExpiry) proxy711.tokenExpiry = Number(d.tokenExpiry);
    if (d.wapiToken) proxy711.wapiToken = d.wapiToken;
    if (d.wapiTokenExpiry) proxy711.wapiTokenExpiry = Number(d.wapiTokenExpiry);
    if (d.packageGb) proxy711.packageGb = Number(d.packageGb);
    if (d.authMode) proxy711.authMode = d.authMode;
    if (d.subuser) proxy711.subuser = d.subuser;
    if (d.subpass) proxy711.subpass = d.subpass;
    if (d.gatewayHost) proxy711.gatewayHost = d.gatewayHost;
    if (d.gatewayPort) proxy711.gatewayPort = Number(d.gatewayPort);
  } catch {}

  // Đọc dự phòng từ Config/Settings/Settings.ini nếu chưa có thông tin
  try {
    const candidatePaths = [join(appDataDirectory, 'Config', 'Settings', 'Settings.ini'), join(fileURLToPath(new URL('../../', new URL('../provider711.mjs', import.meta.url).href)), 'Config', 'Settings', 'Settings.ini'), join(getAutoLeadPCDir(), 'Config', 'Settings', 'Settings.ini')];
    for (const iniPath of candidatePaths) {
      if (existsSync(iniPath)) {
        const text = readFileSync(iniPath, 'utf8');
        const userM = text.match(/^\s*(?:Username|Proxy711User)\s*=\s*(.+)$/im);
        const passM = text.match(/^\s*(?:Passwd|Password|Proxy711Pass)\s*=\s*(.+)$/im);
        const authM = text.match(/^\s*(?:AuthMode|Proxy711AuthMode)\s*=\s*(.+)$/im);
        const subuserM = text.match(/^\s*(?:Subuser|Proxy711SubUser)\s*=\s*(.+)$/im);
        const subpassM = text.match(/^\s*(?:Subpass|Proxy711SubPass)\s*=\s*(.+)$/im);
        const hostM = text.match(/^\s*(?:GatewayHost|Proxy711GatewayHost)\s*=\s*(.+)$/im);
        const portM = text.match(/^\s*(?:GatewayPort|Proxy711GatewayPort)\s*=\s*(.+)$/im);
        if (userM && !proxy711.username) proxy711.username = userM[1].trim();
        if (passM && !proxy711.passwd) proxy711.passwd = passM[1].trim();
        if (authM && !proxy711.authMode) proxy711.authMode = authM[1].trim();
        if (subuserM && !proxy711.subuser) proxy711.subuser = subuserM[1].trim();
        if (subpassM && !proxy711.subpass) proxy711.subpass = subpassM[1].trim();
        if (hostM && !proxy711.gatewayHost) proxy711.gatewayHost = hostM[1].trim();
        if (portM && !proxy711.gatewayPort) proxy711.gatewayPort = Number(portM[1].trim()) || 10000;
        if (proxy711.username && proxy711.passwd) break;
      }
    }
  } catch {}
}
export { loadProxy711Config };
