/**
 * Giữ tiêu đề và thanh IP của Orbita qua các lần điều hướng.
 * @param {object} session Phiên GoLogin cần nhận diện trên Desktop.
 * @return {Promise<void>} Hoàn tất đăng ký init script tự chứa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function decorateGoLoginPages(session) {
  const context = session.browser;
  await context.addInitScript(({ prefix, ip, slot, os, chrome }) => {
    try {
      const applyTitle = () => {
        try {
          let t = document.title || '';
          if (t.startsWith(`[${ip}]`)) return;
          t = t.replace(/^\[.*?\]\s*/g, '').replace(/^\[.*?\]\s*/g, '').trim();
          document.title = `${prefix} ${t || 'Web'}`;
        } catch {}
      };
      applyTitle();
      document.addEventListener('DOMContentLoaded', applyTitle);
      window.addEventListener('load', applyTitle);
      const obs = new MutationObserver(applyTitle);
      const target = document.querySelector('title') || document.head || document.documentElement;
      if (target) {
        obs.observe(target, { subtree: true, characterData: true, childList: true });
      }

      const injectTopBar = () => {
        try {
          if (document.getElementById('__autolead_ip_bar')) return;
          const bar = document.createElement('div');
          bar.id = '__autolead_ip_bar';
          bar.setAttribute('style', [
            'position: fixed', 'top: 0', 'left: 0', 'right: 0', 'height: 20px',
            'background: linear-gradient(90deg, #1e293b, #0f172a)',
            'color: #38bdf8', 'font-family: monospace', 'font-size: 11px', 'font-weight: bold',
            'line-height: 20px', 'padding: 0 10px', 'z-index: 2147483647',
            'display: flex', 'align-items: center', 'gap: 12px', 'box-shadow: 0 1px 4px rgba(0,0,0,0.4)',
            'pointer-events: none', 'user-select: none', 'letter-spacing: 0.3px'
          ].join('; '));
          bar.innerHTML = `<span style="color:#4ade80">●</span> <span>${ip}</span> <span style="color:#64748b">|</span> <span style="color:#f1f5f9">Slot ${slot}</span> <span style="color:#64748b">|</span> <span style="color:#94a3b8">${os} · ${chrome}</span>`;
          (document.body || document.documentElement).appendChild(bar);
        } catch {}
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectTopBar);
      } else {
        injectTopBar();
      }
    } catch {}
  }, {
    prefix: `[${session.exitIp}] [S${session.slot}]`,
    ip: session.exitIp,
    slot: session.slot,
    os: session.deviceProfile,
    chrome: session.chromeVersion
  });
}
