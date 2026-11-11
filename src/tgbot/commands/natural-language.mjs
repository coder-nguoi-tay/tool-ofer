import { BTN_MAIN } from '../state/btn-main.mjs';
import { aiChat } from '../ai-chat.mjs';
import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';
import { suggestionsToButtons } from '../suggestions-to-buttons.mjs';

/**
 * Xử lý lệnh Telegram natural-language.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleNaturalLanguageCommand({
  cmdText,
  chatId,
  userId,
  execCommand,
  name
}) {
  if (!!name.startsWith('/')) return false;

  // Tin nhắn tự nhiên → keyword match trước, AI sau nếu có key
  const t = cmdText.toLowerCase();

  // Keyword matching tiếng Việt (không cần API key)
  const KW = [{
    pat: /\b(app|mini|mini app|live|trực tiếp|live stream|điều khiển)\b/,
    action: () => '/app'
  }, {
    pat: /\b(chạy|run|bật|start|khởi động|mở)\b.*(\d+)/,
    action: m => `/run ${m[2]}`
  }, {
    pat: /\b(chạy|run|bật|start|mở)\b(?!.*\d)(?!.*(màn hình|screen|slot|proxy|log))/,
    action: () => '/run'
  }, {
    pat: /\b(băng thông|dung lượng|tiêu hao|data|bw|bandwidth)\b/,
    action: () => '/bw'
  }, {
    pat: /\b(chụp|screen|màn hình|snapshot|snap)\b.*(\d+)/,
    action: m => `/screen ${m[2]}`
  }, {
    pat: /\b(chụp|screen|màn hình|snapshot|snap)\b/,
    action: () => '/screen'
  }, {
    pat: /\b(tắt|đóng|kill|close)\b.*(slot|luồng|trình duyệt|browser)\s*(\d+)/,
    action: m => `/close ${m[3]}`
  }, {
    pat: /\b(slot|luồng|trình duyệt|browser)\s*(\d+).*(tắt|đóng|kill|close)/,
    action: m => `/close ${m[2]}`
  }, {
    pat: /\b(danh sách|ds|xem|kiểm tra)\b.*(slot|luồng|trình duyệt|browser)\b|\b(slot|luồng|trình duyệt|browser)\b.*(đang chạy|hoạt động)/,
    action: () => '/slots'
  }, {
    pat: /\b(dừng|stop|tắt|kết thúc|ngừng)\b(?!.*(slot|luồng|trình duyệt))/,
    action: () => '/stop'
  }, {
    pat: /\b(tạm dừng|pause|nghỉ)\b/,
    action: () => '/pause'
  }, {
    pat: /\b(xóa|xoá|clear)\b.*\b(proxy|proxies)\b|\b(proxy|proxies)\b.*\b(xóa|xoá|clear)\b/,
    action: () => '/clearproxy'
  }, {
    pat: /\b(proxy|proxies)\b.*\b(còn|bao nhiêu|status|xem)\b|\b(xem|bao nhiêu)\b.*\bproxy\b/,
    action: () => '/proxy'
  }, {
    pat: /\b(mua|buy|nạp|thêm)\b.*\bproxy\b|\bproxy\b.*\b(mua|buy|nạp)\b/,
    action: () => '/buy'
  }, {
    pat: /\b(email)\b.*\b(còn|bao nhiêu|xem)\b|\b(xem|bao nhiêu)\b.*\bemail\b/,
    action: () => '/email'
  }, {
    pat: /\b(lead|leads|kết quả|hoàn thành|done)\b/,
    action: () => '/done'
  }, {
    pat: /\b(tốc độ|speed|nhanh|chậm)\b/,
    action: () => '/speed'
  }, {
    pat: /\b(log|nhật ký|lịch sử)\b.*\b(xem|xóa|clear)\b|\b(xóa|clear)\b.*\blog\b/,
    action: (m, txt) => txt.includes('xóa') || txt.includes('clear') ? '/clear-log' : '/log'
  }, {
    pat: /\b(trạng thái|status|tình trạng|đang làm gì|thế nào)\b/,
    action: () => '/status'
  }, {
    pat: /\b(reset|đặt lại)\b.*\b(lead|bộ đếm|count)\b/,
    action: () => '/reset'
  }];
  let matched = null;
  for (const {
    pat,
    action
  } of KW) {
    const m = t.match(pat);
    if (m) {
      matched = action(m, t);
      break;
    }
  }
  if (matched) {
    await execCommand(chatId, userId, matched);
    return true;
  }

  // Không match keyword → thử AI
  let state = null;
  try {
    const [s, pq] = await Promise.all([appGet('/state'), appGet('/proxy-queue')]);
    state = {
      ...s,
      _proxyAvail: pq.available
    };
  } catch {}
  const decision = await aiChat(cmdText, state);
  if (!decision) {
    await send(chatId, '🤔 Không hiểu yêu cầu. Chọn thao tác bên dưới hoặc gõ /help:', BTN_MAIN);
    return true;
  }

  // Thực hiện action
  const actionMap = {
    status: '/status',
    app: '/app',
    mini: '/app',
    live: '/app',
    bw: '/bw',
    bandwidth: '/bw',
    screen: decision.params?.count ? `/screen ${decision.params.count}` : '/screen',
    slots: '/slots',
    close_slot: decision.params?.count ? `/close ${decision.params.count}` : '/close',
    run: decision.params?.count ? `/run ${decision.params.count}` : '/run',
    stop: '/stop',
    pause: '/pause',
    proxy: '/proxy',
    email: '/email',
    buy_proxy: '/buy',
    done: '/done',
    speed: '/speed',
    reset: '/reset',
    log: '/log',
    clear_log: '/clear-log',
    clear_proxy: '/clearproxy'
  };
  if (decision.action !== 'reply' && actionMap[decision.action]) {
    await execCommand(chatId, userId, actionMap[decision.action]);
  }

  // Gửi message của AI + gợi ý
  if (decision.message && decision.action !== 'status') {
    const suggBtns = suggestionsToButtons(decision.suggestions ?? []);
    await send(chatId, `💬 ${decision.message}`, suggBtns);
  } else if (decision.action === 'reply') {
    const suggBtns = suggestionsToButtons(decision.suggestions ?? []);
    await send(chatId, decision.message || '...', suggBtns || BTN_MAIN);
  }
  return true;
}

