import { extractClickIdCandidates } from '../../lead-check/extract-click-id-candidates.mjs';

// ponytail: giới hạn cứng số ứng viên mỗi phiên; đủ cho chuỗi redirect offer, nâng nếu offer có quá nhiều điều hướng.
const MAX_CLICK_IDS = 200;

/**
 * Ghi clickid ứng viên từ mọi request điều hướng (kể cả từng bước redirect 301/302) để kiểm lead theo clickid,
 * không phụ thuộc IP proxy xoay.
 * @param {object} session Phiên GoLogin; clickIds được tạo nếu chưa có và giữ qua lần nối lại CDP.
 * @param {object} context Context Orbita đang dùng.
 * @return {void} Đã gắn listener request.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function captureClickIds(session, context) {
  session.clickIds ||= new Set();
  context.on('request', request => {
    if (!request.isNavigationRequest()) return;
    for (const clickId of extractClickIdCandidates(request.url())) {
      if (session.clickIds.size >= MAX_CLICK_IDS) return;
      session.clickIds.add(clickId);
    }
  });
}
