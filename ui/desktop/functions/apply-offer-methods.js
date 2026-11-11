/**
     * Đồng bộ 4 URL và cấu hình giải theo đúng thứ tự, không dồn ô trống sang offer khác.
     * @param {object[]} methods Các chiến lược đã lưu trong preset.
     * @return {void} Hoàn tất đồng bộ giao diện.
     * @throws {never} Ô chưa có trong giao diện được bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function applyOfferMethods(methods = []) {
      if (!Array.isArray(methods)) return;
      for (let i = 1; i <= 4; i++) {
        const mc = methods.find((item) => Number(item.offerNumber) === i);
        if (mc?.link) {
          const main = document.getElementById(i === 1 ? 'txtLinkOffer' : `txtLinkOffer${i}`);
          if (main && !main.value) main.value = mc.link;
        }
      }
    }
