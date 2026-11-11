/**
 * Thực hiện click thông minh: cuộn vào tầm nhìn, click theo loại (1: click thường, 2: đúp, 3: phải, 4: nhấn giữ).
 * Tự động dự phòng force: true và evaluate click nếu phần tử bị che hoặc có overlay.
 * @param {object} page page.
 * @param {*} loc loc.
 * @param {number} clickType click type.
 * @return {Promise<void>} Kết quả xử lý execute smart click.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function executeSmartClick(page, loc, clickType = 1) {
  await loc.scrollIntoViewIfNeeded({
    timeout: 2000
  }).catch(() => {});
  const type = parseInt(clickType, 10) || 1;
  switch (type) {
    case 2:
      // Double click
      await loc.dblclick({
        timeout: 5000
      }).catch(async () => {
        await loc.dblclick({
          force: true,
          timeout: 3000
        }).catch(() => {});
      });
      break;
    case 3:
      // Right click
      await loc.click({
        button: 'right',
        timeout: 5000
      }).catch(async () => {
        await loc.click({
          button: 'right',
          force: true,
          timeout: 3000
        }).catch(() => {});
      });
      break;
    case 4:
      // Mouse down / hold
      await loc.hover({
        timeout: 3000
      }).catch(() => {});
      await page.mouse.down().catch(() => {});
      break;
    case 1: // Single left click
    default:
      await loc.click({
        timeout: 5000
      }).catch(async () => {
        // Fallback 1: force click
        await loc.click({
          force: true,
          timeout: 3000
        }).catch(async () => {
          // Fallback 2: evaluate DOM click
          await loc.evaluate(el => {
            el.click();
            el.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true
            }));
          }).catch(() => {});
        });
      });
      break;
  }
}
export { executeSmartClick };
