/**
 * Trích xuất thuộc tính value từ chuỗi HTML input.
 * @param {string} html Chuỗi HTML chứa thẻ input.
 * @return {string} Giá trị thuộc tính value hoặc chuỗi rỗng.
 */
function extractInputValue(html) {
  if (typeof html !== 'string') return '';
  const match = html.match(/value=["']([^"']*)["']/i);
  return match ? match[1] : '';
}

/**
 * Trích xuất thuộc tính src từ chuỗi HTML img.
 * @param {string} html Chuỗi HTML chứa thẻ img.
 * @return {string} Giá trị thuộc tính src hoặc chuỗi rỗng.
 */
function extractImgSrc(html) {
  if (typeof html !== 'string') return '';
  const match = html.match(/src=["']([^"']*)["']/i);
  return match ? match[1] : '';
}

/**
 * Trích xuất thuộc tính href từ chuỗi HTML thẻ a.
 * @param {string} html Chuỗi HTML chứa thẻ a.
 * @return {string} Giá trị thuộc tính href hoặc chuỗi rỗng.
 */
function extractHref(html) {
  if (typeof html !== 'string') return '';
  const match = html.match(/href=["']([^"']*)["']/i);
  return match ? match[1] : '';
}

/**
 * Xác định loại thiết bị / agent từ thẻ img hoặc chuỗi mô tả.
 * @param {string} html Chuỗi HTML hoặc tên agent.
 * @return {string} pc, android, ios hoặc all.
 */
function detectAgentType(html) {
  if (typeof html !== 'string') return 'all';
  const lower = html.toLowerCase();
  if (lower.includes('android')) return 'android';
  if (lower.includes('ios') || lower.includes('iphone') || lower.includes('ipad')) return 'ios';
  if (lower.includes('pc') || lower.includes('windows')) return 'pc';
  return 'all';
}

/**
 * Phân giải một dòng dữ liệu từ toffers get_offers thành đối tượng offer chuẩn hóa.
 *
 * @param {Array<any>} row Mảng cột dữ liệu từ API get_offers của toffers.top.
 * @return {object|null} Đối tượng offer đã phân giải hoặc null nếu row không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
function parseToffersOfferRow(row) {
  if (!Array.isArray(row) || row.length < 12) return null;

  const checkboxHtml = String(row[0] || '');
  const idFromCheckbox = extractInputValue(checkboxHtml);
  const id = String(row[1] || idFromCheckbox || '').trim();
  const image = extractImgSrc(row[2]);
  const netId = String(row[3] || '').trim();
  const name = String(row[4] || '').trim();
  const agentHtml = String(row[5] || '');
  const agent = detectAgentType(agentHtml);
  const geo = Array.isArray(row[6]) ? row[6] : (typeof row[6] === 'string' && row[6] ? [row[6]] : []);
  const payout = String(row[7] || '').trim();
  const clicks = String(row[8] || '').trim();
  const leads = String(row[9] || '').trim();
  const linkClick = extractInputValue(row[10]);
  const linkLead = extractInputValue(row[11]);
  const preview = extractHref(row[12]);
  const description = String(row[13] || '').trim();
  const kpi = String(row[14] || '').trim();
  const status = String(row[16] || '').trim() || 'Unknown';

  return {
    id,
    name,
    netId,
    image,
    agent,
    agentHtml,
    geo,
    payout,
    clicks,
    leads,
    linkClick,
    linkLead,
    preview,
    description,
    kpi,
    status
  };
}

export { parseToffersOfferRow };
