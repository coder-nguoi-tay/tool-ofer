/**
     * Hiển thị hoạt động AI và các trạng thái xác minh lead trong bảng hoạt động.
     * @return {void} Cập nhật các dòng hoạt động trên giao diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderAiActivityGrid() {
      const tbody = document.getElementById('dgvAiActivityBody');
      if (!tbody) return;

      const aiRows = [];
      for (const session of logData) {
        for (const entry of [...session.logs].reverse()) {
          if (entry.type && (entry.type.startsWith('ai_') || entry.type.startsWith('lead_') || entry.type === 'traffic_blocked')) {
            aiRows.push({ session, entry });
          }
        }
      }

      if (aiRows.length === 0) {
        tbody.innerHTML = '<tr><td class="cell-selector">►</td><td colspan="4" style="text-align:center;color:#888888;padding:20px;">Chưa có hoạt động AI nào được ghi nhận.</td></tr>';
        return;
      }

      tbody.innerHTML = aiRows.slice(0, 50).map(({ session, entry }, idx) => {
        let actionBadge = `<span class="badge-log badge-ai">${escHtml(entry.type)}</span>`;
        if (entry.type === 'ai_action') actionBadge = '<span class="badge-log badge-ai-action">Thực thi action</span>';
        else if (entry.type === 'ai_completed') actionBadge = '<span class="badge-log badge-ai-completed">Hoàn tất</span>';
        else if (entry.type === 'ai_started') actionBadge = '<span class="badge-log badge-ai">Bắt đầu quét</span>';
        else if (entry.type === 'ai_error') actionBadge = '<span class="badge-log badge-ai-error">Lỗi AI</span>';
        else if (entry.type === 'ai_smart_fallback') actionBadge = '<span class="badge-log badge-ai">Fallback Heuristic</span>';
        else if (entry.type === 'lead_confirmed') actionBadge = '<span class="badge-log badge-lead">✅ Có lead</span>';
        else if (entry.type === 'lead_ip_mismatch') actionBadge = '<span class="badge-log badge-ai-error">⚠️ Lead chưa khớp IP</span>';
        else if (entry.type === 'lead_check_error') actionBadge = '<span class="badge-log badge-ai-error">⚠️ Lỗi kiểm tra lead</span>';
        else if (entry.type === 'lead_failed') actionBadge = '<span class="badge-log badge-blocked">❌ Không có lead</span>';

        return `<tr>
          <td class="cell-selector">${idx === 0 ? '►' : ''}</td>
          <td>${fmtTime(entry.time)}</td>
          <td style="font-weight:bold;text-align:center;">Slot ${session.slot}</td>
          <td>${actionBadge}</td>
          <td>${escHtml(entry.detail || entry.url || '')}</td>
        </tr>`;
      }).join('');
    }
