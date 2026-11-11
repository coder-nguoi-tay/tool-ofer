/**
 * Chia các slot cần bù cho offer đang có ít phiên nhất; hòa thì chọn offer số nhỏ hơn.
 *
 * @param {object[]} liveBrowsers Các phiên còn sống (offer lấy theo offerNumber ?? streamRole ?? 1).
 * @param {number} offerCount Số offer đang cấu hình.
 * @param {number} needed Số slot cần bù.
 * @param {(offer: number) => boolean} [isEligible] Offer có được bù không (offer đặt Cách giải skip thì không:
 *   launcher bỏ qua offer đó, chọn nó sẽ làm queue bù lặp mãi mà không mở được phiên nào).
 * @return {number[]} Số offer (1..offerCount) cho từng slot bù, theo thứ tự; rỗng nếu không offer nào đủ điều kiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function pickRefillOfferRoles(liveBrowsers, offerCount, needed, isEligible = () => true) {
  const counts = Array.from({ length: offerCount + 1 }, () => 0);
  for (const s of liveBrowsers) {
    const k = s.offerNumber ?? s.streamRole ?? 1;
    if (k >= 1 && k <= offerCount) counts[k] += 1;
  }
  const eligible = [];
  for (let k = 1; k <= offerCount; k++) if (isEligible(k)) eligible.push(k);
  const roles = [];
  if (eligible.length === 0) return roles;
  for (let i = 0; i < needed; i++) {
    let minOffer = eligible[0];
    for (const k of eligible) if (counts[k] < counts[minOffer]) minOffer = k;
    roles.push(minOffer);
    counts[minOffer] += 1;
  }
  return roles;
}
