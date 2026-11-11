/**
 * Show toast.
 * @param {string} message message.
 * @param {string} type type.
 * @return {void} Kết quả xử lý show toast.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function showToast(message, type = 'info') {
      let toastContainer = document.getElementById('globalToastContainer');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'globalToastContainer';
        toastContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(toastContainer);
      }
      const toast = document.createElement('div');
      const bg = type === 'success' ? '#065f46' : (type === 'error' ? '#991b1b' : '#1e293b');
      const border = type === 'success' ? '#34d399' : (type === 'error' ? '#f87171' : '#38bdf8');
      const icon = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');
      toast.style.cssText = `background:${bg};border:1px solid ${border};color:#fff;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;pointer-events:auto;transition:all 0.25s ease;opacity:0;transform:translateY(10px);`;
      toast.innerHTML = `<span>${icon}</span><span>${escHtml(message)}</span>`;
      toastContainer.appendChild(toast);
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 250);
      }, 2500);
    }
