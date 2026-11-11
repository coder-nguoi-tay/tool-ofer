/**
 * Switch offer log tab.
 * @param {*} offerKey offer key.
 * @return {void} Kết quả xử lý switch offer log tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function switchOfferLogTab(offerKey) {
      currentSelectedOfferLogTab = String(offerKey);
      renderLogs();
    }
