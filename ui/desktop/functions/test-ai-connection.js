/**
 * Test ai connection.
 * @return {Promise<void>} Kết quả xử lý test ai connection.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function testAiConnection() {
      const resultEl = document.getElementById('aiTestResult');
      resultEl.textContent = 'Đang kiểm tra kết nối & gửi prompt thử nghiệm...';
      const binary = document.getElementById('cbbAiBinary').value;

      const res = await api('/ai/test', {
        method: 'POST',
        body: JSON.stringify({ binary }),
      });

      if (res && res.success) {
        resultEl.style.color = '#008000';
        resultEl.textContent = res.message || `✓ Kết nối thành công! ${res.binary} (${res.version})`;
        document.getElementById('aiEngineStatusBadge').innerHTML = `● Sẵn sàng (${escHtml(res.binary)} ${escHtml(res.version)})`;
      } else {
        resultEl.style.color = '#b91c1c';
        resultEl.textContent = `✗ ${res.message || res.error || 'Không kết nối được'}`;
      }
    }
