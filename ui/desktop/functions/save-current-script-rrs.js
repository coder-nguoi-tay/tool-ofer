/**
 * Save current script rrs.
 * @return {Promise<*>} Kết quả xử lý save current script rrs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveCurrentScriptRRS() {
      const name = document.getElementById('txtScriptRRSName').value.trim();
      if (!name) return alert('Vui lòng nhập tên script RRS!');
      const content = document.getElementById('txtScriptRRS').value;
      const path = `/Users/codernguoitay/Downloads/AutoLeadPC/Script/RRS/${name}`;
      const res = await api('/script/save', { method: 'POST', body: JSON.stringify({ path, content }) });
      if (res.success) {
        alert('Saved RRS script successfully!');
        await loadScriptRrsList();
      } else {
        alert('Error: ' + res.error);
      }
    }
