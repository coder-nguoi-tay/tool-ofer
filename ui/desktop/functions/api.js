/**
 * Api.
 * @param {string} path path.
 * @param {object} options options.
 * @return {Promise<*>} Kết quả xử lý api.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function api(path, options = {}) {
      try {
        const res = await fetch(path, {
          headers: { 'Content-Type': 'application/json' },
          ...options,
        });
        return await res.json();
      } catch (err) {
        const msg = err.message || '';
        if (msg.toLowerCase().includes('load failed') || msg.toLowerCase().includes('failed to fetch')) {
          return { error: 'Máy chủ chưa sẵn sàng (kết nối thất bại). Vui lòng thử lại sau vài giây hoặc khởi động lại app.' };
        }
        return { error: err.message };
      }
    }
