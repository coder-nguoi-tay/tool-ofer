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
        // POST /711proxy/generate trả {ok, added, message} (lỗi: HTTP 500 {error}), không có `success`.
        if (data.ok) {
          showToast(data.message || `Đã lấy ${data.added} proxy vào hàng đợi!`);
          pollResources();
        } else {
          alert('Lỗi mua: ' + (data.error || 'Thử lại sau'));
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    }
