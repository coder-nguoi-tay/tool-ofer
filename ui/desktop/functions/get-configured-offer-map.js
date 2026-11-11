/**
 * Get configured offer map.
 * @return {*} Kết quả xử lý get configured offer map.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getConfiguredOfferMap() {
      const map = {};
      const o1 = document.getElementById('txtLinkOffer')?.value.trim();
      const o2 = document.getElementById('txtLinkOffer2')?.value.trim();
      const o3 = document.getElementById('txtLinkOffer3')?.value.trim();
      const o4 = document.getElementById('txtLinkOffer4')?.value.trim();
      if (o1) map['1'] = o1.split(/\r?\n/)[0].trim();
      if (o2) map['2'] = o2.split(/\r?\n/)[0].trim();
      if (o3) map['3'] = o3.split(/\r?\n/)[0].trim();
      if (o4) map['4'] = o4.split(/\r?\n/)[0].trim();
      return map;
    }
