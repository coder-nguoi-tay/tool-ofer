/**
 * Setup sub tabs.
 * @param {*} containerId container id.
 * @param {*} tabAttr tab attr.
 * @param {*} panelPrefix panel prefix.
 * @return {void} Kết quả xử lý setup sub tabs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function setupSubTabs(containerId, tabAttr, panelPrefix) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll('.sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          container.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
          const key = tab.getAttribute(tabAttr);
          tab.classList.add('active');
          const parent = container.parentElement;
          parent.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
          const target = document.getElementById(`${panelPrefix}${key}`);
          if (target) target.classList.add('active');
        });
      });
    }
