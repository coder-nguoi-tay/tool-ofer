/**
 * Render bảng danh sách offer từ toffers.top - Tối ưu tập trung vào các LINK OFFER.
 *
 * @param {object} response Dữ liệu phản hồi từ /toffers/offers.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
function renderToffersOffers(response) {
  const tbody = document.getElementById('dgvToffersOffersBody');
  const countEl = document.getElementById('toffersOfferCountText');
  const tabBadge = document.getElementById('tabToffersOffersCount');
  const paginationEl = document.getElementById('toffersPaginationControls');

  if (!response || !response.success) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#f87171;padding:25px;">⚠️ Lỗi nạp danh sách: ${escHtml(response?.error || 'Không kết nối được server')}</td></tr>`;
    }
    return;
  }

  const items = Array.isArray(response.data) ? response.data : [];
  window.currentToffersOffersList = items;

  const total = Number(response.recordsTotal) || 0;
  const filtered = Number(response.recordsFiltered) || 0;
  const start = window.currentToffersPage * window.currentToffersPageSize;
  const end = Math.min(start + items.length, filtered);

  if (tabBadge) {
    tabBadge.textContent = String(total);
  }

  // Cập nhật số lượng trên các nút loại danh sách
  if (response.type === 'working') {
    const el = document.getElementById('cntOffersWorking');
    if (el) el.textContent = String(total);
  } else if (response.type === 'new') {
    const el = document.getElementById('cntOffersNew');
    if (el) el.textContent = String(total);
  } else if (response.type === 'live') {
    const el = document.getElementById('cntOffersLive');
    if (el) el.textContent = String(total);
  }

  if (countEl) {
    if (total === 0) {
      countEl.textContent = '0 link';
    } else {
      countEl.textContent = `${start + 1}-${end} / ${filtered} links (${total} tổng)`;
    }
  }

  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:30px;">Không tìm thấy link offer nào.</td></tr>';
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const rowsHtml = items.map((item, idx) => {
    const stt = start + idx + 1;
    const geoBadges = Array.isArray(item.geo) && item.geo.length
      ? item.geo.map((g) => `<span style="padding:1px 4px;background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:3px;font-size:9.5px;font-weight:700;margin-left:3px;">${escHtml(g.toUpperCase())}</span>`).join('')
      : '';

    const safeName = escHtml(item.name || '--');
    const safeLeadLink = escHtml(item.linkLead || '');
    const safeClickLink = escHtml(item.linkClick || '');
    const safePreview = escHtml(item.preview || '');

    const rawClicks = Number(String(item.clicks || '').replace(/[^0-9]/g, '')) || 0;
    const rawLeads = Number(String(item.leads || '').replace(/[^0-9]/g, '')) || 0;
    const safeClicks = escHtml(String(item.clicks || '0').trim() || '0');
    const safeLeads = escHtml(String(item.leads || '0').trim() || '0');
    const crText = rawClicks > 0 && rawLeads > 0
      ? `${((rawLeads / rawClicks) * 100).toFixed(1)}%`
      : '';

    const previewBtn = safePreview
      ? `<a href="${safePreview}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;font-size:11px;text-decoration:underline;margin-left:6px;" title="Xem trang preview">🌐 Preview</a>`
      : '';

    return `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="text-align:center;color:#64748b;font-size:11px;width:35px;">${stt}</td>
        
        <!-- Tên Offer & ID -->
        <td style="width:210px;min-width:180px;vertical-align:middle;">
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            <span style="font-weight:700;color:#38bdf8;font-family:monospace;font-size:11.5px;">#${escHtml(item.id)}</span>
            ${geoBadges}
            ${item.payout ? `<span style="font-weight:700;color:#22c55e;font-size:11px;margin-left:2px;">$${escHtml(item.payout)}</span>` : ''}
          </div>
          <div style="font-weight:600;color:#f1f5f9;font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeName}">
            ${safeName}
          </div>
        </td>

        <!-- Số Clicks -->
        <td style="text-align:center;vertical-align:middle;color:#94a3b8;font-size:11px;font-family:monospace;font-weight:600;width:65px;" title="Số lượt click: ${safeClicks}">
          ${safeClicks}
        </td>

        <!-- Số Leads & CR -->
        <td style="text-align:center;vertical-align:middle;width:70px;" title="Số lượt lead: ${safeLeads}${crText ? ` (CR: ${crText})` : ''}">
          <span style="font-weight:700;color:#22c55e;font-size:11.5px;font-family:monospace;">${safeLeads}</span>
          ${crText ? `<div style="font-size:9.5px;color:#38bdf8;margin-top:1px;" title="Tỷ lệ chuyển đổi">${crText}</div>` : ''}
        </td>

        <!-- CỘT CHÍNH: LINK LEAD (NO_CLICK) -->
        <td style="vertical-align:middle;">
          ${safeLeadLink ? `
            <div style="display:flex;align-items:center;gap:6px;">
              <input type="text" readonly value="${safeLeadLink}" class="win-input" 
                style="font-family:monospace;font-size:11px;padding:3px 8px;flex:1;background:#090d16;color:#38bdf8;border-color:#1e3a5f;" 
                onclick="this.select()" title="Nhấp để bôi đen toàn bộ link">
              <button type="button" class="win-btn win-btn-primary" 
                style="padding:3px 10px;font-size:11px;font-weight:700;background:#10b981;border-color:#059669;white-space:nowrap;" 
                onclick="useToffersOffer('${escHtml(item.id)}')" title="Nạp link này vào form chạy và chuyển sang tab Đang chạy">⚡ Nạp chạy</button>
              <button type="button" class="win-btn" 
                style="padding:3px 8px;font-size:11px;white-space:nowrap;" 
                onclick="copyToffersLink('${safeLeadLink}', 'Link Lead')" title="Sao chép link này">📋 Copy</button>
            </div>
          ` : '<span style="color:#64748b;font-size:11px;">(Chưa có Link Lead)</span>'}
        </td>

        <!-- CỘT PHỤ: LINK CLICK (NO_LEAD) -->
        <td style="vertical-align:middle;width:240px;">
          ${safeClickLink ? `
            <div style="display:flex;align-items:center;gap:4px;">
              <input type="text" readonly value="${safeClickLink}" class="win-input" 
                style="font-family:monospace;font-size:10px;padding:2px 6px;flex:1;background:#090d16;color:#94a3b8;" 
                onclick="this.select()" title="Link Click Tracking">
              <button type="button" class="win-btn" 
                style="padding:2px 6px;font-size:10px;" 
                onclick="copyToffersLink('${safeClickLink}', 'Link Click')" title="Sao chép Link Click">📋</button>
            </div>
          ` : '<span style="color:#64748b;font-size:10px;">--</span>'}
        </td>

        <!-- Xem / Thao tác khác -->
        <td style="text-align:center;width:75px;white-space:nowrap;vertical-align:middle;">
          ${previewBtn || '<span style="color:#64748b;font-size:10px;">--</span>'}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;

  // Render phân trang
  if (paginationEl) {
    const totalPages = Math.ceil(filtered / window.currentToffersPageSize);
    if (totalPages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }

    const cur = window.currentToffersPage;
    let pagHtml = `<div style="display:flex;align-items:center;gap:4px;font-size:11px;">`;

    pagHtml += `<button type="button" class="win-btn" style="padding:2px 8px;font-size:10.5px;" ${cur === 0 ? 'disabled' : ''} onclick="goToToffersPage(${cur - 1})">◀ Trước</button>`;

    const maxButtons = 7;
    let startPage = Math.max(0, cur - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages - 1, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(0, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      const activeClass = p === cur ? 'win-btn-primary' : '';
      pagHtml += `<button type="button" class="win-btn ${activeClass}" style="padding:2px 7px;font-size:10.5px;min-width:24px;" onclick="goToToffersPage(${p})">${p + 1}</button>`;
    }

    pagHtml += `<button type="button" class="win-btn" style="padding:2px 8px;font-size:10.5px;" ${cur >= totalPages - 1 ? 'disabled' : ''} onclick="goToToffersPage(${cur + 1})">Sau ▶</button>`;
    pagHtml += `</div>`;

    paginationEl.innerHTML = pagHtml;
  }
}
