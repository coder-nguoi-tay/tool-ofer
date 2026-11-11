/**
 * Sync option pills.
 * @return {void} Kết quả xử lý sync option pills.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function syncOptionPills() {
      document.querySelectorAll('.option-pill input[type="checkbox"]').forEach(cb => {
        const pill = cb.closest('.option-pill');
        if (pill) {
          if (cb.checked) {
            pill.classList.add('is-checked');
          } else {
            pill.classList.remove('is-checked');
          }
        }
      });
    }
