/**
 * Render command rows.
 * @param {*} list list.
 * @return {void} Kết quả xử lý render command rows.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderCommandRows(list) {
      const container = document.getElementById('dgvCommandOffer');
      container.innerHTML = '';
      list.forEach(c => {
        const row = document.createElement('div');
        row.className = 'cmd-row';
        row.innerHTML = `<span style="font-weight:bold;">${c.name}</span><span style="color:#888888;font-size:10px;">#${c.id}</span>`;
        row.onclick = () => {
          document.querySelectorAll('.cmd-row').forEach(r => r.classList.remove('active'));
          row.classList.add('active');
          document.getElementById('cmdHelpBox').textContent = `Lệnh: ${c.raw}\nCú pháp: ${c.template}`;
        };
        row.ondblclick = () => insertCommand(c.template + '\n');
        container.appendChild(row);
      });
    }
