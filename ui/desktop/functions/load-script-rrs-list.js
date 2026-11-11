/**
 * Load script rrs list.
 * @return {Promise<void>} Kết quả xử lý load script rrs list.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadScriptRrsList() {
      const data = await api('/scripts');
      const container = document.getElementById('scriptRrsFileList');
      container.innerHTML = '';
      if (data && data.scripts) {
        const rrsScripts = data.scripts.filter(s => s.path.includes('/RRS/') || s.name.startsWith('RRS'));
        rrsScripts.forEach(s => {
          const item = document.createElement('div');
          item.style.padding = '3px 6px';
          item.style.borderBottom = '1px solid #e8e8e8';
          item.style.cursor = 'pointer';
          item.innerHTML = `<span>${s.name}</span>`;
          item.onclick = async () => {
            document.getElementById('txtScriptRRSName').value = s.name;
            const res = await api('/script/read', { method: 'POST', body: JSON.stringify({ path: s.path }) });
            if (res && res.content !== undefined) {
              document.getElementById('txtScriptRRS').value = res.content;
            }
          };
          container.appendChild(item);
        });
      }
    }
