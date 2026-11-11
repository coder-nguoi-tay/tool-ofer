/**
 * Switch running offer tab.
 * @param {*} offerKey offer key.
 * @return {void} Kết quả xử lý switch running offer tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function switchRunningOfferTab(offerKey) {
      currentSelectedRunningOfferTab = String(offerKey);
      fetchRunningState();
      if (_screenViewActive) {
        _pollThumbnails();
      }
    }
