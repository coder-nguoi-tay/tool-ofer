/**
 * Shuffle email input.
 * @return {void} Kết quả xử lý shuffle email input.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function shuffleEmailInput() {
      const el = document.getElementById('txtEmailList');
      if (!el) return;
      const lines = el.value.split('\n').map(l => l.trim()).filter(Boolean);
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }
      el.value = lines.join('\n');
      showToast(`Đã trộn ngẫu nhiên thứ tự ${lines.length} email.`, 'success');
    }
