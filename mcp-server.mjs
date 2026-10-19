#!/usr/bin/env node
/**
 * AutoLeadPC MCP Server — stdio transport
 * Cho phép Codex CLI và Claude Code điều khiển app qua MCP tools.
 *
 * Đăng ký trong ~/.codex/config.toml:
 *   [mcp_servers.autoleadpc]
 *   command = "node"
 *   args = ["/Users/codernguoitay/AutoLeadPC-mac/mcp-server.mjs"]
 */

import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_PORT = Number(process.env.AUTOLEADPC_PORT) || 3210;
const APP = `http://127.0.0.1:${APP_PORT}`;

const instanceId = process.env.AUTOLEADPC_INSTANCE || '1';
const dataDirName = process.env.AUTOLEADPC_DATA_DIR || `AutoLeadPC${instanceId !== '1' ? `-${instanceId}` : ''}`;

// ─── App + Telegram helpers ───────────────────────────────────────────────────

async function appGet(path) {
  const r = await fetch(`${APP}${path}`);
  return r.json();
}

async function appPost(path, body = {}) {
  const r = await fetch(`${APP}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function tgSend(text) {
  try {
    const cfgPath = join(homedir(), 'Library', 'Application Support', dataDirName, 'telegram-config.json');
    const { botToken, notifyChatId, allowedUserId } = JSON.parse(await readFile(cfgPath, 'utf8'));
    const chatId = notifyChatId ?? allowedUserId;
    if (!botToken || !chatId) return 'Telegram chưa cấu hình.';
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    return 'Đã gửi.';
  } catch (e) {
    return `Lỗi: ${e.message}`;
  }
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'app_status',
    description: 'Xem trạng thái đầy đủ của AutoLeadPC: số luồng đang chạy, proxy còn lại, email, leads hoàn thành.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'app_run',
    description: 'Bật tự bù slot / khởi động lại automation. Có thể chỉ định số luồng.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Số luồng muốn chạy (mặc định: giữ nguyên cấu hình cũ)' },
      },
    },
  },
  {
    name: 'app_stop',
    description: 'Dừng tất cả luồng và browser đang chạy.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'app_pause',
    description: 'Tạm dừng mở slot mới nhưng KHÔNG kill session đang chạy.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'proxy_queue',
    description: 'Xem chi tiết hàng đợi proxy: số còn lại, đang dùng.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'email_queue',
    description: 'Xem chi tiết hàng đợi email: số còn lại, đang dùng.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'buy_proxy',
    description: 'Mua thêm proxy từ 711proxy theo cấu hình đã lưu.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_logs',
    description: 'Xem log của các session browser gần nhất.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Số session muốn xem (mặc định: 5)' },
      },
    },
  },
  {
    name: 'clear_logs',
    description: 'Xóa toàn bộ browser logs và file HTML đã lưu.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'tg_notify',
    description: 'Gửi thông báo tới người dùng qua Telegram bot.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Nội dung thông báo (hỗ trợ HTML)' },
      },
      required: ['message'],
    },
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────

async function callTool(name, args = {}) {
  try {
    switch (name) {
      case 'app_status': {
        const [state, pq, eq] = await Promise.all([
          appGet('/state'), appGet('/proxy-queue'), appGet('/email-queue'),
        ]);
        return JSON.stringify({
          running: state.enabled && !state.stopRequested,
          active: state.activeCount,
          target: state.targetCount,
          proxy_available: pq.available,
          proxy_used: pq.used,
          email_available: eq.available,
          email_used: eq.used,
          leads_done: state.limitRun?.count ?? 0,
          leads_max: state.limitRun?.max ?? 0,
          message: state.message,
        }, null, 2);
      }

      case 'app_run': {
        const body = { enabled: true };
        if (args.count > 0) body.targetCount = args.count;
        const res = await appPost('/auto-refill', body);
        const cur = await appGet('/state');
        return `Đã bật tự bù. Target: ${cur.targetCount} luồng. ${res.results?.[0] ?? ''}`;
      }

      case 'app_stop': {
        await appPost('/stop');
        return 'Đã gửi lệnh dừng tất cả.';
      }

      case 'app_pause': {
        await appPost('/auto-refill', { enabled: false });
        return 'Đã tạm dừng mở slot mới. Session đang chạy vẫn tiếp tục.';
      }

      case 'proxy_queue': {
        const pq = await appGet('/proxy-queue');
        return JSON.stringify({ available: pq.available, used: pq.used, dual_stream: pq.dualStream }, null, 2);
      }

      case 'email_queue': {
        const eq = await appGet('/email-queue');
        return JSON.stringify({ available: eq.available, used: eq.used }, null, 2);
      }

      case 'buy_proxy': {
        const ar = await appGet('/711proxy/autorefill');
        if (!ar || ar.error) return 'Lỗi: chưa cấu hình 711proxy auto-refill.';
        const res = await appPost('/711proxy/generate', {
          count: ar.count ?? 50, region: ar.region ?? 'US',
          sessTime: ar.sessTime ?? 20, sessAuto: ar.sessAuto ?? false,
        });
        return `Đã mua ${res.added ?? res.proxyCount ?? '?'} proxy.`;
      }

      case 'get_logs': {
        const limit = Math.min(args.limit ?? 5, 20);
        const data = await appGet('/browser-logs');
        const sessions = (data.sessions ?? []).slice(0, limit);
        return sessions.map((s, i) => {
          const logs = s.logs?.slice(-3) ?? [];
          const logLines = logs.map((l) => `  [${l.type}] ${l.detail ?? l.url ?? ''}`).join('\n');
          return `Session ${i + 1}: IP=${s.ip ?? '?'} | started=${s.startedAt?.slice(0, 16) ?? '?'}\n${logLines}`;
        }).join('\n\n') || 'Chưa có session nào.';
      }

      case 'clear_logs': {
        const res = await appPost('/browser-logs/clear');
        return res.success ? 'Đã xóa toàn bộ log.' : `Lỗi: ${res.error}`;
      }

      case 'tg_notify': {
        return await tgSend(args.message);
      }

      default:
        return `Tool không tồn tại: ${name}`;
    }
  } catch (e) {
    return `Lỗi khi gọi ${name}: ${e.message}`;
  }
}

// ─── JSON-RPC / MCP protocol ──────────────────────────────────────────────────

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

let pending = 0;
let inputClosed = false;

function checkExit() {
  if (inputClosed && pending === 0) process.exit(0);
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { id, method, params } = msg;
  pending++;

  (async () => {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'autoleadpc', version: '1.0.0' },
      });
    } else if (method === 'notifications/initialized') {
      // no-op
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      const text = await callTool(params?.name, params?.arguments ?? {});
      reply(id, { content: [{ type: 'text', text }] });
    } else if (id !== undefined) {
      replyError(id, -32601, `Method not found: ${method}`);
    }
  })().finally(() => { pending--; checkExit(); });
});

rl.on('close', () => { inputClosed = true; checkExit(); });
process.stderr.write('[AutoLeadPC MCP] Sẵn sàng\n');
