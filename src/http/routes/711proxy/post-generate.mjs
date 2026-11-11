import { add711IpWhitelist } from '../../../proxy/provider711.mjs';
import { ensure711Token } from '../../../proxy/provider711.mjs';
import { generate711SubuserProxies } from '../../../proxy/provider711.mjs';
import { importProxyLines } from '../../../proxy/actions/import-proxy-lines.mjs';
import { proxy711 } from '../../../proxy/provider711.mjs';
import { proxy711AutoRefill } from '../../../runtime/constants/proxy711-auto-refill.mjs';
import { proxyQueue } from '../../../runtime/constants/proxy-queue.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveProxy711Config } from '../../../proxy/provider711.mjs';
import { saveProxyQueue } from '../../../proxy/actions/save-proxy-queue.mjs';

/**
 * Xử lý API 711proxy-generate.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePost711proxyGenerate(request, response) {
  if (request.method === 'POST' && request.url === '/711proxy/generate') {
    const body = JSON.parse(await readRequestBody(request));
    const authMode = body.authMode || proxy711.authMode || (body.subuser || proxy711.subuser && !proxy711.subuser.includes('=') ? 'subuser' : 'api');
    const count = Math.min(Math.max(parseInt(body.count) || 50, 1), 200);
    const region = String(body.region || proxy711AutoRefill.region || 'US').trim().toUpperCase();
    const sessTime = Math.max(parseInt(body.sessTime) || 20, 1);
    const sessAuto = body.sessAuto !== undefined ? Boolean(body.sessAuto) : proxy711AutoRefill.sessAuto;
    try {
      let proxyLines = [];
      const isSubuserMode = authMode === 'subuser' || authMode !== 'api' && Boolean(body.subuser || proxy711.subuser && !proxy711.subuser.includes('='));
      if (isSubuserMode) {
        const subuser = String(body.subuser || proxy711.subuser || '').trim();
        const subpass = String(body.subpass || proxy711.subpass || '').trim();
        const gateway = String(body.gateway || `${proxy711.gatewayHost}:${proxy711.gatewayPort}`).trim();
        if (!subuser || !subpass) {
          throw new Error('Chưa nhập Sub-user hoặc Sub-password 711Proxy. Vui lòng tạo tài khoản con trên dashboard 711proxy rồi điền vào app.');
        }
        proxy711.subuser = subuser;
        proxy711.subpass = subpass;
        proxy711.authMode = 'subuser';
        if (gateway) {
          const [gh, gp] = gateway.split(':');
          if (gh) proxy711.gatewayHost = gh;
          if (gp) proxy711.gatewayPort = parseInt(gp) || 10000;
        }
        await saveProxy711Config();
        proxyLines = generate711SubuserProxies({
          subuser,
          subpass,
          count,
          region,
          sessTime,
          sessAuto,
          gatewayHost: proxy711.gatewayHost,
          gatewayPort: proxy711.gatewayPort
        });
      } else {
        async function doGenerate() {
          const genUrl = new URL('http://global.rotgbapi.trustsource.live:8089/gen');
          genUrl.searchParams.set('zone', 'custom');
          genUrl.searchParams.set('ptype', '1');
          genUrl.searchParams.set('region', region);
          genUrl.searchParams.set('count', String(count));
          genUrl.searchParams.set('proto', 'http');
          genUrl.searchParams.set('stype', 'text');
          genUrl.searchParams.set('split', '\r\n');
          genUrl.searchParams.set('sessType', 'sticky');
          genUrl.searchParams.set('sessTime', String(sessTime));
          genUrl.searchParams.set('sessAuto', String(sessAuto ? 1 : 0));
          const res = await fetch(genUrl.toString());
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
          const text = await res.text();
          if (!text.trim() || text.includes('"code"') || text.toLowerCase().includes('whitelist')) throw new Error(text.slice(0, 300));
          return text;
        }
        let text;
        try {
          text = await doGenerate();
        } catch (e) {
          // Nếu lỗi whitelist → tự cập nhật IP rồi retry 1 lần
          const errMsg = e.message.toLowerCase();
          if (errMsg.includes('whitelist')) {
            const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
            const ip = ipRes ? (await ipRes.json().catch(() => ({}))).ip : null;
            const token = await ensure711Token();
            if (ip && token) {
              try {
                await add711IpWhitelist(ip, token);
                await new Promise(r => setTimeout(r, 2000));
                text = await doGenerate(); // retry
              } catch (wErr) {
                throw new Error(`IP ${ip} chưa được whitelist 711proxy. Tự cập nhật whitelist thất bại (${wErr.message}).`);
              }
            } else {
              throw new Error(`IP ${ip || 'của bạn'} chưa có trong whitelist 711proxy. Vui lòng chuyển sang dùng chế độ User & Pass (không cần whitelist) hoặc đăng nhập để whitelist.`);
            }
          } else {
            throw e;
          }
        }
        // Chuẩn hóa: host:port → http://host:port, user:pass@host:port → http://user:pass@host:port
        const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        proxyLines = rawLines.map(l => {
          if (/^https?:\/\//i.test(l)) return l;
          const at = l.lastIndexOf('@');
          if (at > 0) return `http://${l.slice(0, at)}@${l.slice(at + 1)}`;
          const parts = l.split(':');
          if (parts.length === 4) return `http://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`;
          // host:port không có creds
          return `http://${l}`;
        });
      }
      const added = importProxyLines(proxyLines, 'http');
      await saveProxyQueue();
      respondWithJson(response, 200, {
        ok: true,
        added,
        total: proxyQueue.available.length,
        authMode,
        lines: proxyLines,
        preview: proxyLines.slice(0, 3),
        message: `Đã nạp ${added} proxy (${authMode === 'subuser' ? 'User & Pass' : 'API Whitelist'}, ${region}, ${sessTime}p) vào hàng đợi (tổng ${proxyQueue.available.length} sẵn sàng).`
      });
    } catch (e) {
      respondWithJson(response, 500, {
        error: e.message
      });
    }
    return true;
  }
  return false;
}
