import { moduleState } from './state/module-state.mjs';

/**
 * Gán số thứ tự toàn cục cho sự kiện log vừa thêm hoặc vừa cập nhật (gộp lặp), để tab Log chỉ tải phần mới
 * (`GET /browser-logs?since=`). Sự kiện gộp được đánh lại số để client thấy repeatCount thay đổi.
 *
 * @param {object} entry Sự kiện log đã có id.
 * @return {object} Chính sự kiện đó, có `seq`.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function stampLogSeq(entry) {
  entry.seq = ++moduleState.logSeq;
  return entry;
}
