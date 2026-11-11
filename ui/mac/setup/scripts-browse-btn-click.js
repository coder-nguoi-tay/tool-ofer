// ── Script browser ───────────────────────────────────────────────────
    document.getElementById('scripts-browse-btn').addEventListener('click', async () => {
      const listEl = document.getElementById('scripts-list');
      listEl.style.display = 'block';
      listEl.textContent = 'Đang tìm script…';
      try {
        const data = await fetch('/scripts').then((r) => r.json());
        if (!data.scripts?.length) {
          listEl.innerHTML = '<p style="padding:10px;margin:0;color:#768197;">Không tìm thấy file .txt nào trong thư mục AutoLeadPC/Script/.</p>';
          return;
        }
        listEl.innerHTML = data.scripts.map((s) => `
          <div style="padding:6px 10px;border-bottom:1px solid #e7ebf2;cursor:pointer;"
               onclick="document.getElementById('script-path').value='${s.path.replace(/'/g, "\\'")}';document.getElementById('scripts-list').style.display='none';">
            <span style="color:#2563eb;font-weight:600;">${s.name}</span>
            <span style="color:#94a3b8;font-size:10px;margin-left:6px;">${s.dir}</span>
          </div>
        `).join('');
      } catch (e) {
        listEl.innerHTML = `<p style="padding:10px;margin:0;color:#dc2626;">Lỗi: ${e.message}</p>`;
      }
    });
