/**
 * Show toast.
 * @param {*} msg msg.
 * @return {void} Kết quả xử lý show toast.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function showToast(msg) {
      const existing = document.querySelector('.toast-msg');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.className = 'toast-msg';
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }
