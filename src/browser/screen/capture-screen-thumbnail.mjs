let activeThumbnailCaptures = 0;

/**
 * Chụp thumbnail với cache 10 giây và tối đa hai lượt chụp toàn ứng dụng, không tích hàng đợi.
 * Ảnh cũ chỉ được dùng lại trên cùng Page và URL; tab đổi trong lúc chụp không được nhận ảnh cũ.
 * @param {object} session Phiên sở hữu cache ảnh thu nhỏ.
 * @param {object} page Tab cần chụp.
 * @param {object} diagnostics Bộ đếm chụp của phiên.
 * @return {Promise<Buffer|null>} Ảnh mới/cache, hoặc null để client thử lại khi hết tải.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function captureScreenThumbnail(session, page, diagnostics) {
  const url = page.url();
  if (session.snapshotPage !== page || session.snapshotUrl !== url) {
    session.snapshotPage = page;
    session.snapshotUrl = url;
    session.lastSnapshot = null;
    session.lastSnapshotAt = 0;
  }
  const fresh = session.lastSnapshot && Date.now() - session.lastSnapshotAt < 10_000;
  if (!fresh && !session.snapshotInFlight && activeThumbnailCaptures < 2) {
    activeThumbnailCaptures += 1;
    const startedAt = Date.now();
    session.snapshotInFlight = Promise.resolve().then(() => page.screenshot({
      type: 'jpeg', quality: 35, scale: 'css', timeout: 3000,
    })).then(buffer => {
      const duration = Date.now() - startedAt;
      diagnostics.captures += 1;
      diagnostics.captureDurationTotalMs += duration;
      diagnostics.captureDurationMaxMs = Math.max(diagnostics.captureDurationMaxMs, duration);
      if (session.snapshotPage !== page || session.snapshotUrl !== url || page.isClosed() || page.url() !== url) return null;
      session.lastSnapshot = buffer;
      session.lastSnapshotAt = Date.now();
      return buffer;
    }).catch(() => {
      diagnostics.captureFailures += 1;
      return null;
    }).finally(() => {
      activeThumbnailCaptures -= 1;
      session.snapshotInFlight = null;
    });
  }
  const image = session.lastSnapshot ?? (await session.snapshotInFlight);
  return session.snapshotPage === page && session.snapshotUrl === url && !page.isClosed() && page.url() === url ? image ?? null : null;
}
