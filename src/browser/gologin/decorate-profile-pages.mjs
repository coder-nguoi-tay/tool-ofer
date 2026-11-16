/**
 * Đồng bộ tiêu đề/thanh IP của Orbita với IP phiên, kể cả tab đang mở và lần điều hướng sau.
 * @param {object} session Phiên GoLogin cần nhận diện trên Desktop.
 * @return {Promise<void>} Đã đăng ký bản nhận diện mới và cập nhật các tab đang mở.
 * @throws {Error} Khi context không thể đăng ký init script.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function decorateGoLoginPages(session) {
  const context = session.browser;
  const display = {
    revision: session._gologinIpDisplayRevision = (session._gologinIpDisplayRevision || 0) + 1,
    ip: session.exitIp, slot: session.slot, os: session.deviceProfile, chrome: session.chromeVersion
  };
  /**
   * Cài một controller DOM dùng IP mới nhất, không tạo observer cạnh tranh giữa các bản init script.
   * @param {object} identity IP, slot, thiết bị và revision từ phiên Node.
   * @return {void} Thanh/title do AutoLeadPC quản lý đã đồng bộ.
   * @throws {never} Trang đang điều hướng hoặc chặn DOM được bỏ qua.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-16
   */
  function applyGoLoginIdentity(identity) {
    try {
      const state = window.__autoleadGoLoginDisplay ||= { revision: -1 };
      if (identity.revision < state.revision) return;
      Object.assign(state, identity);
      if (!state.applyTitle) {
        state.applyTitle = () => {
          try {
            const prefix = `[${state.ip}] [S${state.slot}]`;
            const title = document.title || '';
            if (title.startsWith(`${prefix} `)) return;
            document.title = `${prefix} ${title.replace(/^\[.*?\]\s*/g, '').replace(/^\[.*?\]\s*/g, '').trim() || 'Web'}`;
          } catch {}
        };
        state.apply = () => {
          state.applyTitle();
          let bar = document.getElementById('__autolead_ip_bar');
          if (!bar) {
            bar = document.createElement('div');
            bar.id = '__autolead_ip_bar';
            bar.setAttribute('style', [
              'position: fixed', 'top: 0', 'left: 0', 'right: 0', 'height: 20px',
              'background: linear-gradient(90deg, #1e293b, #0f172a)',
              'color: #38bdf8', 'font-family: monospace', 'font-size: 11px', 'font-weight: bold',
              'line-height: 20px', 'padding: 0 10px', 'z-index: 2147483647',
              'display: flex', 'align-items: center', 'gap: 12px', 'box-shadow: 0 1px 4px rgba(0,0,0,0.4)',
              'pointer-events: none', 'user-select: none', 'letter-spacing: 0.3px'
            ].join('; '));
            bar.innerHTML = '<span style="color:#4ade80">●</span> <span data-autolead-ip></span> <span style="color:#64748b">|</span> <span data-autolead-slot style="color:#f1f5f9"></span> <span style="color:#64748b">|</span> <span data-autolead-device style="color:#94a3b8"></span>';
            (document.body || document.documentElement).appendChild(bar);
          }
          bar.querySelector('[data-autolead-ip]').textContent = state.ip;
          bar.querySelector('[data-autolead-slot]').textContent = `Slot ${state.slot}`;
          bar.querySelector('[data-autolead-device]').textContent = `${state.os} · ${state.chrome}`;
          if (!state.observer) {
            const target = document.querySelector('title') || document.head || document.documentElement;
            if (target) {
              state.observer = new MutationObserver(state.applyTitle);
              state.observer.observe(target, { subtree: true, characterData: true, childList: true });
            }
          }
        };
        document.addEventListener('DOMContentLoaded', state.apply);
        window.addEventListener('load', state.apply);
      }
      state.apply();
    } catch {}
  }
  // Revision ngăn init script chứa IP cũ ghi đè IP mới khi reload/tab mới hoặc cập nhật cùng lúc.
  await context.addInitScript(applyGoLoginIdentity, display);
  await Promise.all(context.pages().filter(page => !page.isClosed()).map(page => page.evaluate(applyGoLoginIdentity, display).catch(() => {})));
}
