/**
 * Buy711 proxies.
 * @param {number} count count.
 * @return {Promise<void>} Kết quả xử lý buy711 proxies.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function buy711Proxies(count) {
      showToast(`Đang mua ${count} proxy từ 711...`);
      try {
        const res = await fetch('/711proxy/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count }),
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Đã lấy ${data.count || count} proxy vào hàng đợi!`);
          pollResources();
        } else {
          alert('Lỗi mua: ' + (data.error || 'Thử lại sau'));
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    }
