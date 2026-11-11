/**
 * Send input.
 * @param {*} body body.
 * @return {Promise<*>} Kết quả xử lý send input.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function sendInput(body) {
      if (!currentSlot && currentSlot !== 0) return null;
      try {
        const res = await fetch(`/screen/input/${currentSlot}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return await res.json().catch(() => null);
      } catch (err) {
        return null;
      }
    }
