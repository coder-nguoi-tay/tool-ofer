import { createHash } from 'node:crypto';

/**
 * Rút gọn bản HTML bằng chứng, bỏ script/data URI nặng và tính dấu nội dung bỏ marker thay đổi nền.
 * @param {string} source HTML lấy từ tab, không thay đổi DOM thật hoặc chức năng export HTML thủ công.
 * @param {number} maxBytes Trần HTML lưu tự động, mặc định 512 KB.
 * @return {object} HTML đã giới hạn, fingerprint và metadata thông báo phần bị rút gọn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function prepareSnapshotHtml(source, maxBytes = 512 * 1024) {
  const compact = String(source || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<autoleadpc-mouse-pointer\b[^>]*>[\s\S]*?<\/autoleadpc-mouse-pointer\s*>/gi, '')
    .replace(/data:[^\s"'<>)]{1024,}/gi, 'data:removed-from-snapshot');
  const stable = compact.replace(/\sdata-(?:ux|survey)-[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const contentHash = createHash('sha256').update(stable).digest('hex');
  const bytes = Buffer.from(compact);
  const truncated = bytes.length > maxBytes;
  const notice = '\n<!-- AutoLeadPC: HTML snapshot truncated; use manual HTML export for full DOM. -->';
  const html = truncated ? bytes.subarray(0, Math.max(0, maxBytes - Buffer.byteLength(notice))).toString('utf8').replace(/\uFFFD$/, '') + notice : compact;
  return { html, contentHash, htmlOriginalBytes: Buffer.byteLength(source || ''), htmlStoredBytes: Buffer.byteLength(html), htmlTruncated: truncated, htmlCompacted: html !== source };
}
