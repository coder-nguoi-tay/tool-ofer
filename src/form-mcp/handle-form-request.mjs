import { suppliedValue, explicitChoiceValue } from './supplied-value.mjs';
import { setTimeout as wait } from 'node:timers/promises';
import { activeBrowsers } from '../browser/sessions.mjs';
import { resolveDebugPage } from '../browser/screen/resolve-debug-page.mjs';
import { shouldStopAfterLead } from '../autofill/should-stop-after-lead.mjs';
import { buildSelectCandidates } from '../autofill/select/build-select-candidates.mjs';
import { readRequestBody } from '../http/actions/read-request-body.mjs';
import { respondWithJson } from '../http/actions/respond-with-json.mjs';
import { consumePairing } from './pairing.mjs';
import { operateOnForm } from './operate-on-form.mjs';

const grants = new Map();

/**
 * Bỏ quyền ngay khi tab đóng, đổi document, hết hạn hoặc người dùng ngắt ghép.
 * @param {object} grant Quyền của client và handle của form được chọn.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
function revoke(grant) {
  grants.delete(grant.token);
  clearTimeout(grant.timer);
  grant.page.off('close', grant.onClose);
  grant.page.off('framenavigated', grant.onNavigation);
  void grant.form.dispose().catch(() => {});
}

/**
 * Ghép quyền của client với đúng tab Screen View, form và record hiện tại.
 * @param {number} slot Slot người dùng đã chọn.
 * @param {object} pair Origin, hạn dùng và bí mật đã đọc từ file của client.
 * @return {Promise<object>} Origin và hạn dùng để hiển thị cho người vận hành.
 * @throws {Error} Khi tab, record hoặc form không đủ điều kiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function shareForm(slot, pair) {
  const page = resolveDebugPage(slot);
  const session = [...activeBrowsers].find(item => !item.isClosed && (item.slot ?? item.tileIndex + 1) === slot);
  if (!page || !session || ['skip','consent_only'].includes(session.offerMode) || shouldStopAfterLead(session) || new URL(page.url()).origin !== pair.origin) {
    throw new Error('Tab đang chọn không khớp origin hoặc phiên đang dừng.');
  }
  const record = page._assignedRecord || (page === session.mainPage && session.currentRecord);
  if (!record) throw new Error('Tab này chưa có record được app gán.');
  const forms = page.locator('form[data-autoleadpc-mcp="record"]');
  if (await forms.count() !== 1) throw new Error('Trang cần công bố đúng một form data-autoleadpc-mcp="record".');
  const form = await forms.elementHandle({ timeout: 1200 });
  const initial = await form.evaluate(operateOnForm, { origin: pair.origin }).catch(() => null);
  if (!initial?.fields?.length || page.isClosed() || page !== resolveDebugPage(slot) || Date.now() >= pair.expiresAt) {
    await form.dispose();
    throw new Error('Tab đã đổi hoặc chưa có trường khả dụng.');
  }
  for (const prior of grants.values()) if (prior.slot === slot) revoke(prior);
  const grant = { ...pair, slot, page, session, record, form };
  grant.onClose = () => revoke(grant);
  grant.onNavigation = frame => { if (frame === page.mainFrame()) revoke(grant); };
  grant.timer = setTimeout(grant.onClose, Math.max(1, pair.expiresAt - Date.now()));
  grant.timer.unref();
  grants.set(pair.token, grant);
  page.once('close', grant.onClose);
  page.on('framenavigated', grant.onNavigation);
  return { origin: pair.origin, expiresAt: pair.expiresAt };
}

/**
 * Phục vụ ghép tab từ giao diện local và thao tác MCP có bearer của đúng client.
 * @param {import('node:http').IncomingMessage} request Yêu cầu từ Screen View hoặc cầu nối stdio.
 * @param {import('node:http').ServerResponse} response Phản hồi chỉ chứa metadata hoặc kết quả.
 * @return {Promise<boolean>} True nếu route thuộc MCP biểu mẫu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function handleFormMcpRequest(request, response) {
  if (!request.url?.startsWith('/form-mcp/')) return false;
  const send = (status, payload) => { respondWithJson(response, status, payload); return true; };
  const { headers, socket } = request;
  const localHost = ['127.0.0.1', 'localhost', '[::1]'].some(host => headers.host === host + ':' + socket.localPort);
  if (!localHost || !['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(socket.remoteAddress) ||
      Object.keys(headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-') || key.startsWith('cf-'))) {
    return send(403, { error: 'MCP biểu mẫu chỉ nhận kết nối trực tiếp trên máy này.' });
  }
  if (request.method === 'GET' && request.url === '/form-mcp/capabilities') return send(200, { formMcp: 1 });
  if (request.method !== 'POST') return send(405, { error: 'Cần dùng POST.' });
  const route = /^\/form-mcp\/(share|revoke)\/([1-9]\d*)$/.exec(request.url);
  if (route && headers.origin !== 'http://' + headers.host) return send(403, { error: 'Cần ghép từ Screen View local.' });
  if (!route && (headers.origin || headers['sec-fetch-site'])) return send(403, { error: 'Cần dùng cầu nối stdio.' });
  try {
    if (route) {
      const slot = Number(route[2]);
      if (route[1] === 'revoke') {
        for (const grant of grants.values()) if (grant.slot === slot) revoke(grant);
        return send(200, { revoked: true });
      }
      const { code } = JSON.parse(await readRequestBody(request));
      const pair = consumePairing(code);
      const info = await shareForm(slot, pair);
      return send(200, info);
    }
    if (!['/form-mcp/inspect', '/form-mcp/fill', '/form-mcp/disconnect'].includes(request.url)) return send(404, { error: 'Không có công cụ này.' });
    const token = /^Bearer ([a-f0-9]{64})$/.exec(headers.authorization || '')?.[1];
    const grant = grants.get(token);
    if (!grant) return send(403, { error: 'Chưa được ghép hoặc quyền đã hết hạn.' });
    if (request.url === '/form-mcp/disconnect') { revoke(grant); return send(200, { revoked: true }); }
    const args = JSON.parse(await readRequestBody(request));
    const fill = request.url === '/form-mcp/fill';
    if (!args || typeof args !== 'object' || Array.isArray(args) || (fill
      ? Object.keys(args).length !== 1 || typeof args.field !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(args.field)
      : Object.keys(args).length !== 0)) return send(400, { error: 'Tham số công cụ không hợp lệ.' });
    const { page, session, record } = grant;
    if (grants.get(token) !== grant || Date.now() >= grant.expiresAt || session.isClosed || ['skip','consent_only'].includes(session.offerMode) || shouldStopAfterLead(session) ||
        resolveDebugPage(grant.slot) !== page || page.isClosed() || new URL(page.url()).origin !== grant.origin ||
        (page._assignedRecord || (page === session.mainPage && session.currentRecord)) !== record) {
      revoke(grant); return send(409, { error: 'Tab hoặc record đã đổi. Hãy ghép lại.' });
    }
    const value = fill ? suppliedValue(record, args.field, session) : null;
    if (fill && value === null) return send(422, { error: 'Record của app thiếu dữ liệu cho trường này.' });
    const operation = {
      origin: grant.origin, field: args.field, value,
      choiceValue: fill ? explicitChoiceValue(record, args.field) : null,
      candidates: fill ? buildSelectCandidates(value, { name: args.field }) : []
    };
    let result = await grant.form.evaluate(operateOnForm, operation);
    if (fill && result.verified) {
      await wait(550);
      if (grants.get(token) !== grant || (page._assignedRecord || (page === session.mainPage && session.currentRecord)) !== record ||
          suppliedValue(record, args.field, session) !== value || explicitChoiceValue(record, args.field) !== operation.choiceValue) return send(409, { error: 'Quyền hoặc dữ liệu đã đổi khi xác minh.' });
      result = await grant.form.evaluate(operateOnForm, { ...operation, verifyOnly: true });
    }
    if (result.fields) {
      for (const item of result.fields) {
        const explicitOnly = item.kind === 'checkbox' || item.kind === 'select-multiple';
        item.available = (explicitOnly ? explicitChoiceValue(record, item.field) : suppliedValue(record, item.field, session)) !== null;
      }
    }
    return send(result.error || result.verified === false ? 409 : 200, result);
  } catch {
    return send(409, { error: 'Không thể dùng form. Kiểm tra mã ghép, origin, record của tab và các trường được công bố.' });
  }
}
