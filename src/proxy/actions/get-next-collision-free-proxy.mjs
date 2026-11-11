import { acquireProxyLock } from './acquire-proxy-lock.mjs';
import { dualStreamState } from '../../runtime/constants/dual-stream-state.mjs';
import { getProxyUniqueKey } from './get-proxy-unique-key.mjs';
import { isProxyCurrentlyActive } from './is-proxy-currently-active.mjs';
import { multiOfferState } from '../../runtime/constants/multi-offer-state.mjs';
import { saveDualStreamState } from '../../runtime/actions/save-dual-stream-state.mjs';
import { syncDualStreamState } from '../../runtime/actions/sync-dual-stream-state.mjs';

/**
 * Thuật toán phân bổ proxy tránh nhau đa luồng (Collision-Free Multi-Offer Allocator):
 * - 1 proxy dùng được lại cho tất cả offer (khi offer trước đã hoàn tất và đóng trình duyệt).
 * - Tránh mở 1 IP cho 2 offer cùng nhau: bỏ qua các proxy đang active ở bất kỳ cửa sổ nào khác.
 * - Phân bổ lệch pha (stride / reversed) theo từng offer để các luồng không va chạm.
 *
 * @param {number} offerNumber Số thứ tự của offer (1, 2, ...).
 * @param {Array<object>} proxies Danh sách proxy khả dụng.
 * @param {number} offerCount Tổng số offer cấu hình.
 * @return {object|null} Proxy được chọn và khóa độc quyền, hoặc null nếu không còn proxy rảnh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function getNextCollisionFreeProxy(offerNumber = 1, proxies = [], offerCount = 1) {
  if (!proxies.length) return null;
  const M = proxies.length;
  const totalOffers = Math.max(offerCount, offerNumber, 1);

  // Đồng bộ từ dualStreamState nếu có cập nhật bên ngoài
  if (dualStreamState.stream1Used) {
    if (!multiOfferState.offerUsed.has(1)) multiOfferState.offerUsed.set(1, dualStreamState.stream1Used);else if (dualStreamState.stream1Used.size === 0 && multiOfferState.offerUsed.get(1).size > 0) {
      multiOfferState.offerUsed.get(1).clear();
    }
  }
  if (dualStreamState.stream2Used) {
    if (!multiOfferState.offerUsed.has(2)) multiOfferState.offerUsed.set(2, dualStreamState.stream2Used);else if (dualStreamState.stream2Used.size === 0 && multiOfferState.offerUsed.get(2).size > 0) {
      multiOfferState.offerUsed.get(2).clear();
    }
  }
  if (!multiOfferState.offerUsed.has(offerNumber)) {
    multiOfferState.offerUsed.set(offerNumber, new Set());
  }
  const usedSet = multiOfferState.offerUsed.get(offerNumber);

  // Nếu offer này đã dùng qua tất cả proxy trong danh sách, tự động xoá usedSet để bắt đầu vòng mới
  if (usedSet.size >= M) {
    usedSet.clear();
  }

  // Khởi tạo cursor nếu chưa có
  if (!multiOfferState.offerCursors.has(offerNumber)) {
    if (totalOffers === 2) {
      const startIdx = offerNumber === 1 ? dualStreamState.stream1Index || 0 : dualStreamState.stream2Index >= 0 ? dualStreamState.stream2Index : Math.max(0, M - 1);
      const direction = offerNumber === 1 ? 1 : -1;
      multiOfferState.offerCursors.set(offerNumber, startIdx);
      multiOfferState.offerDirections.set(offerNumber, direction);
    } else {
      const startIdx = Math.floor((offerNumber - 1) * M / totalOffers) % M;
      multiOfferState.offerCursors.set(offerNumber, startIdx);
      multiOfferState.offerDirections.set(offerNumber, 1);
    }
  } else {
    if (offerNumber === 1 && Number.isInteger(dualStreamState.stream1Index) && dualStreamState.stream1Index !== multiOfferState.offerCursors.get(1)) {
      multiOfferState.offerCursors.set(1, dualStreamState.stream1Index);
    }
    if (offerNumber === 2 && Number.isInteger(dualStreamState.stream2Index) && dualStreamState.stream2Index !== multiOfferState.offerCursors.get(2)) {
      multiOfferState.offerCursors.set(2, dualStreamState.stream2Index >= 0 ? dualStreamState.stream2Index : Math.max(0, M - 1));
    }
  }
  let cursor = multiOfferState.offerCursors.get(offerNumber) ?? 0;
  const direction = multiOfferState.offerDirections.get(offerNumber) ?? 1;
  for (let step = 0; step < M; step++) {
    const idx = ((cursor + step * direction) % M + M) % M;
    const candidate = proxies[idx];
    if (!candidate) continue;
    const pKey = getProxyUniqueKey(candidate);

    // 1. Offer này đã dùng proxy này chưa?
    if (usedSet.has(pKey)) {
      continue;
    }

    // 2. Proxy này có đang được mở ở offer / cửa sổ khác cùng lúc không?
    if (isProxyCurrentlyActive(candidate)) {
      continue; // Đang chạy, tạm thời bỏ qua để không trùng IP đồng thời
    }

    // Proxy hợp lệ: khóa ngay lập tức và ghi nhận đã dùng cho offer này
    acquireProxyLock(candidate);
    usedSet.add(pKey);
    const nextCursor = ((idx + direction) % M + M) % M;
    multiOfferState.offerCursors.set(offerNumber, nextCursor);
    syncDualStreamState(totalOffers);
    void saveDualStreamState();
    return candidate;
  }

  // Nếu vòng lặp đầu tiên không tìm được proxy (do các proxy rảnh đều đã nằm trong usedSet của lượt trước),
  // và còn ít nhất 1 proxy không bận ở cửa sổ khác: reset usedSet cho offer này và thử lại một lượt.
  const hasInactiveProxy = proxies.some(p => !isProxyCurrentlyActive(p));
  if (hasInactiveProxy) {
    usedSet.clear();
    for (let step = 0; step < M; step++) {
      const idx = ((cursor + step * direction) % M + M) % M;
      const candidate = proxies[idx];
      if (!candidate) continue;
      if (isProxyCurrentlyActive(candidate)) {
        continue;
      }
      const pKey = getProxyUniqueKey(candidate);
      acquireProxyLock(candidate);
      usedSet.add(pKey);
      const nextCursor = ((idx + direction) % M + M) % M;
      multiOfferState.offerCursors.set(offerNumber, nextCursor);
      syncDualStreamState(totalOffers);
      void saveDualStreamState();
      return candidate;
    }
  }
  return null;
}
