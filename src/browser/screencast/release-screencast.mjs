/**
 * Tháo screencast hiện tại của slot: gỡ listener tự khôi phục TRƯỚC khi detach (detach phát 'close',
 * nếu còn listener thì màn xem bị kéo về tab chính), tắt timer chụp bù, dừng screencast.
 *
 * @param {object} scObj
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function releaseScreencast(scObj) {
  scObj.unbindListeners?.();
  scObj.unbindListeners = null;
  if (scObj.keepaliveTimer) {
    clearInterval(scObj.keepaliveTimer);
    scObj.keepaliveTimer = null;
  }
  const cdp = scObj.cdpClient;
  if (cdp) {
    await cdp.send('Page.stopScreencast').catch(() => {});
    await cdp.detach().catch(() => {});
  }
}
export { releaseScreencast };
