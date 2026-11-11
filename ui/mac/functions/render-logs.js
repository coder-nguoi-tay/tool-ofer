/**
 * Render logs.
 * @return {void} Kết quả xử lý render logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderLogs() {
      const slotFilter = logFilterSlot.value;
      const typeFilter = logFilterType.value;
      const slots = new Set(logData.map((s) => String(s.slot)));

      // Cập nhật danh sách slot
      const curSlot = logFilterSlot.value;
      logFilterSlot.innerHTML = '<option value="">Tất cả slot</option>'
        + [...slots].sort().map((s) => `<option value="${s}"${s === curSlot ? ' selected' : ''}>Slot ${s}</option>`).join('');

      const rows = [];
      for (const session of logData) {
        if (slotFilter && String(session.slot) !== slotFilter) continue;
        for (const entry of [...session.logs].reverse()) {
          if (typeFilter && entry.type !== typeFilter) continue;
          rows.push({ session, entry });
        }
      }

      logEmpty.hidden = rows.length > 0;
      logTbody.innerHTML = rows.map(({ session, entry }) => {
        let typeLabel = '🖱 click';
        let detail = `${escHtml(entry.tag ?? '')} ${escHtml(entry.text ?? '')}`.trim();
        const hasHtml = entry.type === 'navigate' && entry.html;

        if (entry.type === 'navigate') {
          typeLabel = '🔗 điều hướng';
          detail = escHtml(entry.url);
        } else if (entry.type === 'submit_clicked') {
          typeLabel = '<span style="color:#16a34a;font-weight:700;">🚀 Submit</span>';
          detail = `<strong style="color:#15803d;">${escHtml(entry.text || 'Submit')}</strong> ${entry.tag ? `&lt;${escHtml(entry.tag)}&gt;` : ''} ${entry.id ? `#${escHtml(entry.id)}` : ''}`.trim();
        } else if (entry.type === 'checkbox_checked') {
          typeLabel = '<span style="color:#2563eb;font-weight:600;">☑️ Checkbox</span>';
          detail = `Đã tích ô điều khoản: <strong style="color:#1d4ed8;">${escHtml(entry.id || entry.name || 'consent')}</strong> (${escHtml(entry.text || '')})`;
        } else if (entry.type === 'field_filled') {
          typeLabel = '<span style="color:#475569;">✍️ Điền ô</span>';
          detail = `[${escHtml(entry.id || entry.name || '')}] = <strong>${escHtml(entry.text || entry.value || '')}</strong>`;
        } else if (entry.type === 'traffic_blocked') {
          typeLabel = '<span style="color:#dc2626;font-weight:700;">🚫 Bị chặn</span>';
          detail = `<span style="color:#dc2626;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'lead_confirmed') {
          typeLabel = '<span style="color:#16a34a;font-weight:700;">✅ Có lead</span>';
          detail = `<span style="color:#16a34a;font-weight:600;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_started') {
          typeLabel = '<span style="color:#8b5cf6;font-weight:600;">🤖 AI phân tích</span>';
          detail = `<span style="color:#7c3aed;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_action') {
          typeLabel = '<span style="color:#6366f1;font-weight:600;">🤖 AI làm</span>';
          detail = `<span style="color:#4f46e5;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_completed') {
          typeLabel = '<span style="color:#0284c7;font-weight:600;">🤖 AI xong</span>';
          detail = `<span style="color:#0284c7;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_error') {
          typeLabel = '<span style="color:#ef4444;font-weight:600;">⚠️ AI lỗi</span>';
          detail = `<span style="color:#dc2626;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'adtrapper_reload') {
          typeLabel = '<span style="color:#f59e0b;font-weight:600;">🔄 Tải lại</span>';
          detail = `<span style="color:#b45309;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.detail) {
          detail = escHtml(entry.detail);
        }

        const fileTag = entry.htmlFilename
          ? ` <span style="display:inline-block;margin-left:4px;font-size:10px;color:#0369a1;background:#e0f2fe;padding:1px 5px;border-radius:3px;font-family:monospace;" title="${escHtml(entry.htmlPath || '')}">📄 ${escHtml(entry.htmlFilename)}</span>`
          : '';
        return `<tr class="${escHtml(entry.type)}">`
          + `<td>${fmtTime(entry.time)}</td>`
          + `<td>Slot ${session.slot} · ${escHtml(session.ip)}</td>`
          + `<td>${typeLabel}</td>`
          + `<td style="cursor:${hasHtml ? 'pointer' : 'default'}" `
          + `${hasHtml ? `data-html="${escHtml(entry.html)}" data-title="${escHtml(entry.url)}" data-filepath="${escHtml(entry.htmlPath || '')}"` : ''}>`
          + detail + (hasHtml ? ' <span style="color:#9aabb8;font-size:10px;">[xem HTML]</span>' : '') + fileTag
          + `</td></tr>`;
      }).join('');
    }
