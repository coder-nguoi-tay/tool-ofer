/**
 * Telegram bot để điều khiển AutoLeadPC từ xa.
 * Config: ~/Library/Application Support/AutoLeadPC-2/telegram-config.json
 * {
 *   "botToken": "123456:ABC...",
 *   "allowedUserId": 123456789,
 *   "notifyChatId": 123456789   (tùy chọn, mặc định = allowedUserId)
 * }
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Tính lại dataDirName để tránh circular import với app.mjs
const instanceId = process.env.AUTOLEADPC_INSTANCE || '1';
const instanceSuffix = instanceId !== '1' ? `-${instanceId}` : '';
const dataDirName = process.env.AUTOLEADPC_DATA_DIR || `AutoLeadPC${instanceSuffix}`;

const APP_PORT = Number(process.env.AUTOLEADPC_PORT) || 3210;
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;

let cfg = null; // { botToken, allowedUserId, notifyChatId }
let lastUpdateId = 0;
let notifyChatId = null;

// Trạng thái để phát hiện thay đổi (dùng cho push notification)
let lastActiveCount = 0;
let lastLimitRunCount = 0;
let lastLimitRunMax = 0;
let stuckSince = null; // Date khi activeCount = 0 với enabled = true
let lowProxyNotified = false;
let sessionLeadsAtBotStart = 0;
let botStartTime = Date.now();

// ─── Gửi thông báo push ra Telegram ─────────────────────────────────────────

export async function tgNotify(text) {
  if (!cfg || !notifyChatId) return;
  await tgPost('sendMessage', { chat_id: notifyChatId, text, parse_mode: 'HTML' }).catch(() => {});
}

// ─── Telegram API ─────────────────────────────────────────────────────────────

async function tgPost(method, body = {}) {
  const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function send(chatId, text) {
  await tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' }).catch(() => {});
}

// ─── Local app API ────────────────────────────────────────────────────────────

async function appGet(path) {
  const r = await fetch(`${APP_BASE}${path}`);
  return r.json();
}

async function appPost(path, body = {}) {
  const r = await fetch(`${APP_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ─── AI Agent mode (Claude API) ───────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `Bạn là trợ lý điều khiển app AutoLeadPC qua Telegram.
App AutoLeadPC tự động điền form leads, chạy trên Mac, dùng proxy và email.

Các hành động bạn CÓ THỂ thực hiện (trả về JSON):
- status: xem trạng thái hiện tại
- run: bật/bật lại tự bù slot
- stop: dừng tất cả
- pause: tạm dừng (không kill session đang chạy)
- buy_proxy: mua thêm proxy từ 711proxy
- proxy: xem hàng đợi proxy
- email: xem hàng đợi email
- done: xem số leads hoàn thành
- reset: reset bộ đếm leads
- speed: xem tốc độ leads/giờ
- log: xem log gần nhất
- reply: chỉ trả lời, không làm gì

Trả về JSON: { "action": "<tên hành động>", "message": "<câu trả lời tiếng Việt ngắn gọn>" }
Không giải thích thêm ngoài JSON.`;

async function aiDecide(userText, currentState) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return null;

  const contextStr = currentState
    ? `Trạng thái hiện tại: active=${currentState.activeCount}/${currentState.targetCount}, enabled=${currentState.enabled}, leads=${currentState.limitRun?.count ?? 0}/${currentState.limitRun?.max ?? 0}, message="${currentState.message}"`
    : '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: AI_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `${contextStr}\n\nTin nhắn từ người dùng: "${userText}"`,
        }],
      }),
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// ─── Xử lý lệnh ──────────────────────────────────────────────────────────────

async function handleCommand(chatId, userId, text) {
  if (userId !== cfg.allowedUserId) return;

  // lưu chat id để push sau này
  if (notifyChatId === null) {
    notifyChatId = chatId;
    cfg.notifyChatId = chatId;
  }

  const cmd = text.trim().split(/\s+/);
  const name = cmd[0].toLowerCase();

  if (name === '/status' || name === '/s') {
    const [state, pq, eq] = await Promise.all([
      appGet('/state'),
      appGet('/proxy-queue'),
      appGet('/email-queue'),
    ]);
    const running = state.enabled && !state.stopRequested;
    const elapsedMin = Math.round((Date.now() - botStartTime) / 60000);
    const leadsNow = state.limitRun?.count ?? 0;
    const speedPerHour = elapsedMin > 0
      ? Math.round(((leadsNow - sessionLeadsAtBotStart) / elapsedMin) * 60)
      : 0;
    await send(chatId,
      `<b>📊 Trạng thái</b>\n` +
      `▶ Luồng: ${state.activeCount}/${state.targetCount} ${running ? '🟢' : '🔴'}\n` +
      `📦 Proxy: ${pq.available ?? pq} còn / ${(pq.used ?? 0)} dùng\n` +
      `📧 Email: ${eq.available} còn / ${eq.used} dùng\n` +
      `✅ Leads hôm nay: ${leadsNow}${state.limitRun?.max > 0 ? '/' + state.limitRun.max : ''}\n` +
      `⚡ Tốc độ: ~${speedPerHour} leads/giờ\n` +
      `💬 ${state.message || ''}`
    );

  } else if (name === '/run' || name === '/resume') {
    const res = await appPost('/auto-refill', { enabled: true });
    await send(chatId, `🟢 ${res.results?.[0] || 'Đã bật tự bù.'}`);

  } else if (name === '/stop') {
    await appPost('/stop');
    await send(chatId, '🔴 Đã gửi lệnh dừng tất cả.');

  } else if (name === '/pause') {
    // Tắt tự bù nhưng không kill session đang chạy
    await appPost('/auto-refill', { enabled: false });
    await send(chatId, '⏸ Đã tạm dừng mở slot mới. Các trình duyệt đang chạy vẫn tiếp tục.');

  } else if (name === '/proxy') {
    const pq = await appGet('/proxy-queue');
    await send(chatId,
      `<b>📦 Hàng đợi Proxy</b>\n` +
      `Còn: ${pq.available}\nĐang dùng: ${pq.used}\n` +
      `Dual stream: ${pq.dualStream ? '✅' : '❌'}`
    );

  } else if (name === '/email') {
    const eq = await appGet('/email-queue');
    await send(chatId,
      `<b>📧 Hàng đợi Email</b>\nCòn: ${eq.available}\nĐang dùng: ${eq.used}`
    );

  } else if (name === '/done') {
    const state = await appGet('/state');
    const count = state.limitRun?.count ?? 0;
    const max = state.limitRun?.max ?? 0;
    await send(chatId, `✅ Leads hoàn thành: <b>${count}</b>${max > 0 ? `/${max}` : ''}`);

  } else if (name === '/limit') {
    const n = parseInt(cmd[1], 10);
    if (!n || n < 0) {
      await send(chatId, 'Dùng: /limit <số> — ví dụ /limit 100');
    } else {
      // Cập nhật limit qua launch với limitRun (cần settings hiện tại)
      await send(chatId, `Hiện tại limit phải set từ UI khi Launch. Dùng /status để xem count.`);
    }

  } else if (name === '/buy' || name === '/711buy') {
    const ar = await appGet('/711proxy/autorefill');
    if (!ar || ar.error) {
      await send(chatId, '⚠️ Chưa cấu hình 711proxy auto-refill.');
      return;
    }
    const res = await appPost('/711proxy/generate', {
      count: ar.count ?? 50,
      region: ar.region ?? 'US',
      sessTime: ar.sessTime ?? 20,
      sessAuto: ar.sessAuto ?? false,
    });
    const added = res.added ?? res.proxyCount ?? '?';
    await send(chatId, `🛒 Đã mua proxy: +${added} proxy được thêm vào hàng đợi.`);

  } else if (name === '/speed') {
    const state = await appGet('/state');
    const leadsNow = state.limitRun?.count ?? 0;
    const elapsedMin = Math.round((Date.now() - botStartTime) / 60000) || 1;
    const speed = Math.round(((leadsNow - sessionLeadsAtBotStart) / elapsedMin) * 60);
    await send(chatId, `⚡ Tốc độ: ~${speed} leads/giờ (${leadsNow - sessionLeadsAtBotStart} leads trong ${elapsedMin} phút)`);

  } else if (name === '/reset') {
    await appPost('/limit-run/reset');
    sessionLeadsAtBotStart = 0;
    botStartTime = Date.now();
    await send(chatId, '🔄 Đã reset bộ đếm leads về 0.');

  } else if (name === '/log') {
    const state = await appGet('/state');
    const sessions = (await appGet('/browser-logs').catch(() => ({ sessions: [] }))).sessions ?? [];
    const last3 = sessions.slice(0, 3).map((s, i) => {
      const lastLog = s.logs?.slice(-1)[0];
      return `${i + 1}. [${s.ip ?? '?'}] ${lastLog?.type ?? 'n/a'}: ${String(lastLog?.detail ?? lastLog?.url ?? '').slice(0, 60)}`;
    });
    await send(chatId,
      `<b>📋 Log gần nhất</b>\n${last3.join('\n') || 'Chưa có session.'}\n\n💬 ${state.message}`
    );

  } else if (name === '/help' || name === '/start') {
    const hasAi = !!process.env.ANTHROPIC_API_KEY;
    await send(chatId,
      `<b>🤖 AutoLeadPC Bot</b>${hasAi ? ' <i>(AI mode bật)</i>' : ''}\n\n` +
      `/status — Trạng thái đầy đủ\n` +
      `/run — Bật tự bù slot\n` +
      `/pause — Tạm dừng (không kill session)\n` +
      `/stop — Dừng tất cả\n` +
      `/proxy — Hàng đợi proxy\n` +
      `/email — Hàng đợi email\n` +
      `/done — Leads hoàn thành\n` +
      `/speed — Tốc độ leads/giờ\n` +
      `/buy — Mua thêm proxy 711\n` +
      `/reset — Reset bộ đếm leads\n` +
      `/log — Log session gần nhất\n\n` +
      (hasAi ? '💬 Hoặc chat tự nhiên — AI sẽ hiểu và thực hiện.' : '💡 Set ANTHROPIC_API_KEY để bật chế độ chat tự nhiên.')
    );

  } else if (!name.startsWith('/')) {
    // Tin nhắn tự nhiên → AI agent xử lý
    let state = null;
    try { state = await appGet('/state'); } catch {}

    const decision = await aiDecide(text, state);
    if (!decision) {
      await send(chatId, '🤔 Không hiểu yêu cầu. Gõ /help để xem danh sách lệnh.');
      return;
    }

    const aiMsg = decision.message || '';
    // Thực hiện action AI quyết định
    switch (decision.action) {
      case 'status':   await handleCommand(chatId, userId, '/status'); break;
      case 'run':      await handleCommand(chatId, userId, '/run'); break;
      case 'stop':     await handleCommand(chatId, userId, '/stop'); break;
      case 'pause':    await handleCommand(chatId, userId, '/pause'); break;
      case 'buy_proxy': await handleCommand(chatId, userId, '/buy'); break;
      case 'proxy':    await handleCommand(chatId, userId, '/proxy'); break;
      case 'email':    await handleCommand(chatId, userId, '/email'); break;
      case 'done':     await handleCommand(chatId, userId, '/done'); break;
      case 'speed':    await handleCommand(chatId, userId, '/speed'); break;
      case 'reset':    await handleCommand(chatId, userId, '/reset'); break;
      case 'log':      await handleCommand(chatId, userId, '/log'); break;
      default:
        if (aiMsg) await send(chatId, aiMsg);
    }
    // Nếu AI có message riêng (giải thích) + action → gửi thêm
    if (aiMsg && !['reply', 'status', 'proxy', 'email', 'done', 'speed', 'log'].includes(decision.action)) {
      await send(chatId, `💬 ${aiMsg}`);
    }
  }
}

// ─── Auto push notifications ──────────────────────────────────────────────────

async function checkAndNotify() {
  if (!notifyChatId) return;

  try {
    const [state, pq] = await Promise.all([appGet('/state'), appGet('/proxy-queue')]);

    const active = state.activeCount ?? 0;
    const enabled = state.enabled && !state.stopRequested;
    const proxyAvail = pq.available ?? 0;
    const limitCount = state.limitRun?.count ?? 0;
    const limitMax = state.limitRun?.max ?? 0;

    // Cảnh báo proxy thấp (< 10)
    if (proxyAvail < 10 && proxyAvail > 0 && !lowProxyNotified) {
      lowProxyNotified = true;
      await tgNotify(`⚠️ <b>Proxy sắp hết!</b> Còn ${proxyAvail} proxy trong hàng đợi. Dùng /buy để mua thêm.`);
    } else if (proxyAvail >= 15) {
      lowProxyNotified = false; // reset để notify lại lần sau
    }

    // Cảnh báo proxy = 0
    if (proxyAvail === 0 && enabled && lastActiveCount > 0) {
      await tgNotify(`🚫 <b>Hết proxy!</b> Không còn proxy nào. Luồng sẽ dừng khi hết session hiện tại.`);
    }

    // Phát hiện stuck: enabled nhưng 0 active > 10 phút
    if (enabled && active === 0) {
      if (!stuckSince) stuckSince = Date.now();
      else if (Date.now() - stuckSince > 10 * 60 * 1000) {
        await tgNotify(`⚠️ <b>Có thể bị stuck!</b> Tự bù đang bật nhưng 0 trình duyệt hoạt động trong 10+ phút.\nDùng /run để thử khởi động lại.`);
        stuckSince = Date.now() + 15 * 60 * 1000; // chờ 15p mới báo lại
      }
    } else {
      stuckSince = null;
    }

    // Thông báo khi đạt limit
    if (limitMax > 0 && limitCount >= limitMax && lastLimitRunCount < limitMax) {
      await tgNotify(`🎉 <b>Hoàn thành!</b> Đã đạt ${limitCount}/${limitMax} leads. Luồng đã tự dừng.`);
    }

    // Thông báo mỗi 50 leads (nếu không có limit)
    if (limitMax === 0 && limitCount > 0 && limitCount % 50 === 0 && limitCount !== lastLimitRunCount) {
      await tgNotify(`✅ Đã hoàn thành <b>${limitCount} leads</b>. ⚡ Tốc độ: ~${Math.round(((limitCount - sessionLeadsAtBotStart) / Math.max(1, (Date.now() - botStartTime) / 60000)) * 60)} leads/giờ`);
    }

    lastActiveCount = active;
    lastLimitRunCount = limitCount;
    lastLimitRunMax = limitMax;
  } catch {} // poll lỗi → im lặng
}

// ─── Polling loop ─────────────────────────────────────────────────────────────

async function pollUpdates() {
  try {
    const data = await tgPost('getUpdates', { offset: lastUpdateId + 1, timeout: 25 });
    if (!data.ok || !data.result) return;
    for (const upd of data.result) {
      lastUpdateId = upd.update_id;
      const msg = upd.message;
      if (!msg?.text) continue;
      const text = msg.text.split('@')[0]; // strip /cmd@botname
      await handleCommand(msg.chat.id, msg.from.id, text);
    }
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// ─── Khởi động ────────────────────────────────────────────────────────────────

export async function startTelegramBot() {
  const configPath = join(homedir(), 'Library', 'Application Support', dataDirName, 'telegram-config.json');
  try {
    const raw = JSON.parse(await readFile(configPath, 'utf8'));
    if (!raw.botToken || !raw.allowedUserId) return;
    cfg = raw;
    notifyChatId = raw.notifyChatId ?? null;
    console.log('[TGBot] Đã khởi động, allowedUserId:', cfg.allowedUserId);
  } catch {
    return; // file không tồn tại → không bật bot
  }

  // Lấy lead count ban đầu để tính speed chính xác
  try {
    const state = await appGet('/state');
    sessionLeadsAtBotStart = state.limitRun?.count ?? 0;
    lastLimitRunCount = sessionLeadsAtBotStart;
  } catch {}

  // Long poll loop
  const poll = async () => {
    try {
      await pollUpdates();
    } catch {}
    setTimeout(poll, 1000);
  };
  void poll();

  // Push notification check mỗi 30s
  setInterval(checkAndNotify, 30_000);

  // Thông báo bot đã sẵn sàng
  // (chờ 3s cho notifyChatId được set từ message đầu tiên, hoặc dùng config)
  if (cfg.notifyChatId) {
    notifyChatId = cfg.notifyChatId;
    await tgNotify(`🤖 <b>AutoLeadPC đã khởi động</b> lúc ${new Date().toLocaleTimeString('vi-VN')}\nGõ /status để xem trạng thái.`);
  }
}
