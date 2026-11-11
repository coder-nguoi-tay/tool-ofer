/**
 * Deduplicate email input.
 * @return {void} Kết quả xử lý deduplicate email input.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function deduplicateEmailInput() {
      const el = document.getElementById('txtEmailList');
      if (!el) return;
      const lines = el.value.split('\n').map(l => l.trim()).filter(Boolean);
      const initialCount = lines.length;
      const unique = Array.from(new Set(lines.map(l => l.toLowerCase())));
      el.value = unique.join('\n');
      const removed = initialCount - unique.length;
      showToast(`Đã lọc trùng email: Đã xoá ${removed} dòng trùng, còn ${unique.length} email.`, 'success');
    }
