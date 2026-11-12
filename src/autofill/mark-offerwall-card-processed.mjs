/**
 * Đánh dấu thẻ đã thử mở và đúng CTA đã bấm, vẫn giữ các ô/nút của form hiện ra sau đó.
 * @param {object} frame Frame sở hữu thẻ.
 * @param {object} card UID thẻ, UID CTA và nhãn trước khi bấm.
 * @return {Promise<void>} Gắn marker nếu node vẫn còn trong document hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function markOfferwallCardProcessed(frame, card) {
  await frame.evaluate(({ uid, buttonUid, actionLabel }) => {
    document.querySelector(`[data-ux-card-id="${uid}"]`)?.setAttribute('data-ux-opened', '1');
    if (buttonUid) document.querySelector(`[data-ux-offer-cta-id="${buttonUid}"]`)?.setAttribute('data-ux-offer-action-label', actionLabel || '');
  }, card).catch(() => {});
}
