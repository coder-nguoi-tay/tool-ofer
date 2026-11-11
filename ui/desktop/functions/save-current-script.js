/**
 * Save current script.
 * @return {Promise<*>} Kết quả xử lý save current script.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveCurrentScript() {
      const name = document.getElementById('txtNameScript').value.trim();
      if (!name) return alert('Vui lòng nhập tên script!');
      const content = document.getElementById('txtScript').value;
      const path = currentScriptPath || `/Users/codernguoitay/Downloads/AutoLeadPC/Script/Offers/${name}`;
      const res = await api('/script/save', { method: 'POST', body: JSON.stringify({ path, content }) });
      if (res.success) {
        alert('Saved script successfully!');
        await loadScriptList();
      } else {
        alert('Error: ' + res.error);
      }
    }
