/**
     * Chuyển sang tab tác vụ được chọn và đồng bộ trạng thái trợ năng.
     * @param {string} tabName Tên tab cần hiển thị.
     * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function activateTab(tabName) {
      tabButtons.forEach((tabButton) => {
        const isSelected = tabButton.dataset.tab === tabName;
        tabButton.setAttribute('aria-selected', String(isSelected));
        tabButton.tabIndex = isSelected ? 0 : -1;
      });
      tabPanels.forEach((tabPanel) => {
        tabPanel.hidden = tabPanel.dataset.panel !== tabName;
      });
    }
