/**
 * Suggestions to buttons.
 * @param {Array<*>} suggestions suggestions.
 * @return {*} Kết quả xử lý suggestions to buttons.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function suggestionsToButtons(suggestions = []) {
  const MAP = {
    'status': {
      text: '📊 Status',
      cb: 'status'
    },
    'app': {
      text: '📱 Mini App',
      cb: 'app'
    },
    'mini': {
      text: '📱 Mini App',
      cb: 'app'
    },
    'live': {
      text: '📱 Mini App',
      cb: 'app'
    },
    'bw': {
      text: '📶 Băng thông',
      cb: 'bw'
    },
    'bandwidth': {
      text: '📶 Băng thông',
      cb: 'bw'
    },
    'screen': {
      text: '📺 Màn hình',
      cb: 'screen'
    },
    'snap': {
      text: '📺 Màn hình',
      cb: 'screen'
    },
    'slots': {
      text: '🌐 DS Slot',
      cb: 'slots'
    },
    'browsers': {
      text: '🌐 DS Slot',
      cb: 'slots'
    },
    'run': {
      text: '▶ Run',
      cb: 'run'
    },
    'stop': {
      text: '🛑 Stop',
      cb: 'stop'
    },
    'pause': {
      text: '⏸ Pause',
      cb: 'pause'
    },
    'proxy': {
      text: '📦 Proxy',
      cb: 'proxy'
    },
    'email': {
      text: '📧 Email',
      cb: 'email'
    },
    'buy_proxy': {
      text: '🛒 Mua Proxy',
      cb: 'buy'
    },
    'done': {
      text: '✅ Leads',
      cb: 'done'
    },
    'speed': {
      text: '⚡ Speed',
      cb: 'speed'
    },
    'log': {
      text: '📋 Log',
      cb: 'log'
    },
    'reset': {
      text: '🔄 Reset',
      cb: 'reset'
    },
    'clear_log': {
      text: '🗑 Xóa Log',
      cb: 'clear_log'
    },
    'clear_proxy': {
      text: '🗑 Xóa tất cả proxy',
      cb: 'clear_proxy'
    },
    'clearproxy': {
      text: '🗑 Xóa tất cả proxy',
      cb: 'clear_proxy'
    }
  };
  const btns = suggestions.map(s => MAP[s] || MAP[s.toLowerCase()]).filter(Boolean);
  if (!btns.length) return null;
  // Chia thành hàng 2 để dễ bấm trên điện thoại
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  return rows;
}
export { suggestionsToButtons };
