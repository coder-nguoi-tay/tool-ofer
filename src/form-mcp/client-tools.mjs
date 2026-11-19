import { rmSync } from 'node:fs';
import { issuePairing } from './pairing.mjs';

const empty = { type: 'object', properties: {}, additionalProperties: false };
export const formTools = [
  { name: 'form_pair', description: 'Tạo mã để người dùng ghép với một form của họ trong Screen View.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string', description: 'Origin của trang, ví dụ https://forms.example.org' } }, required: ['origin'], additionalProperties: false } },
  { name: 'form_inspect', description: 'Đọc nhãn, loại trường và tình trạng có dữ liệu trong record của tab đã ghép.', inputSchema: empty },
  { name: 'form_fill', description: 'Điền một trường đã công bố từ record của app. Agent chỉ chọn tên trường.',
    inputSchema: { type: 'object', properties: { field: { type: 'string' } }, required: ['field'], additionalProperties: false } },
  { name: 'form_disconnect', description: 'Thu hồi quyền của agent trên tab.', inputSchema: empty },
];
let pairing;
process.once('exit', () => { if (pairing) rmSync(pairing.file, { force: true }); });

/**
 * Chạy một công cụ biểu mẫu qua backend cục bộ của đúng instance.
 * @param {string} name Tên công cụ được MCP client yêu cầu.
 * @param {object} args Tham số từ agent.
 * @param {string} app URL loopback của backend.
 * @return {Promise<object>} Kết quả theo hợp đồng tools/call.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function callFormTool(name, args, app) {
  const result = (data, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], isError });
  const definition = formTools.find(tool => tool.name === name);
  if (!definition || !args || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some(key => !Object.hasOwn(definition.inputSchema.properties, key)) ||
      (definition.inputSchema.required || []).some(key => typeof args[key] !== 'string' || !args[key])) {
    return result({ error: 'Công cụ hoặc tham số không hợp lệ.' }, true);
  }
  try {
    if (name === 'form_pair') {
      const status = await fetch(app + '/form-mcp/capabilities', { redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (!status.ok || (await status.json()).formMcp !== 1) return result({ error: 'Backend đang chạy chưa hỗ trợ MCP biểu mẫu.' }, true);
      if (pairing && pairing.expiresAt > Date.now()) {
        if (pairing.origin !== args.origin) return result({ error: 'Hãy ngắt ghép trước khi đổi origin.' }, true);
      } else {
        if (pairing) rmSync(pairing.file, { force: true });
        pairing = issuePairing(args.origin);
      }
      return result({ code: pairing.code, origin: pairing.origin, expiresAt: pairing.expiresAt,
        instruction: 'Trên máy chạy app, mở Screen View của tab, bấm MCP biểu mẫu và nhập mã. Sau đó gọi form_inspect.' });
    }
    if (!pairing) return result({ error: 'Hãy gọi form_pair trước.' }, true);
    const action = { form_inspect: 'inspect', form_fill: 'fill', form_disconnect: 'disconnect' }[name];
    const response = await fetch(app + '/form-mcp/' + action, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pairing.token },
      body: JSON.stringify(args), signal: AbortSignal.timeout(5000) });
    if (name === 'form_disconnect' && (response.ok || response.status === 403)) {
      rmSync(pairing.file, { force: true }); pairing = null;
      return result({ revoked: true });
    }
    if (response.status === 404) return result({ error: 'Backend hiện tại chưa hỗ trợ MCP biểu mẫu.' }, true);
    return result(await response.json(), !response.ok);
  } catch {
    return result({ error: 'Kiểm tra origin, cổng backend và kết nối tới app cục bộ.' }, true);
  }
}
