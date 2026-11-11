/**
 * Send.
 * @param {*} endpoint endpoint.
 * @param {string} pendingText pending text.
 * @param {*} overrides overrides.
 * @return {Promise<*>} Kết quả xử lý send.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function send(endpoint, pendingText, overrides) {
      buttons.forEach((b) => { b.disabled = true; });
      status.textContent = pendingText;
      warnings.textContent = '';
      try {
        const payload = buildRequestBody(overrides);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        status.textContent = result.results.join('\n');
        warnings.textContent = (result.warnings ?? []).join('\n');
        return result;
      } catch (error) {
        status.textContent = error.message;
        return null;
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    }
