/**
 * Sync option pills.
 * @return {void} Kết quả xử lý sync option pills.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function syncOptionPills() {
      document.querySelectorAll('.option-pill').forEach((pill) => {
        const cb = pill.querySelector('input[type="checkbox"]');
        if (cb) pill.classList.toggle('active', cb.checked);
      });
    }
