/**
 * Deduplicate proxy input.
 * @return {void} Kết quả xử lý deduplicate proxy input.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function deduplicateProxyInput() {
      const el = document.getElementById('txtDashboardProxy');
      if (!el) return;
      const lines = el.value.split('\n').map(l => l.trim()).filter(Boolean);
      const initialCount = lines.length;
      const unique = Array.from(new Set(lines));
      el.value = unique.join('\n');
      const removed = initialCount - unique.length;
      showToast(`Đã lọc trùng proxy: Đã xoá ${removed} dòng trùng, còn ${unique.length} proxy.`, 'success');
    }
