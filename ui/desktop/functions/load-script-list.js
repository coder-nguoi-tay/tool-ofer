/**
 * Load script list.
 * @return {Promise<void>} Kết quả xử lý load script list.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadScriptList() {
      const data = await api('/scripts');
      const container = document.getElementById('scriptFileList');
      const cbb = document.getElementById('cbbScript');
      container.innerHTML = '';
      cbb.innerHTML = '<option value="">-- Mặc định (Tự động + AI Assist) --</option>';

      if (data && data.scripts) {
        data.scripts.forEach(s => {
          const item = document.createElement('div');
          item.style.padding = '3px 6px';
          item.style.borderBottom = '1px solid #e8e8e8';
          item.style.cursor = 'pointer';
          item.innerHTML = `<span>${s.name}</span>`;
          item.onclick = async () => {
            currentScriptPath = s.path;
            document.getElementById('txtNameScript').value = s.name;
            const res = await api('/script/read', { method: 'POST', body: JSON.stringify({ path: s.path }) });
            if (res && res.content !== undefined) {
              document.getElementById('txtScript').value = res.content;
            }
          };
          container.appendChild(item);

          const opt = document.createElement('option');
          opt.value = s.path;
          opt.textContent = s.name;
          cbb.appendChild(opt);
        });
      }
    }
