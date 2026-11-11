/**
 * Poll slot tabs.
 * @param {number} slot slot.
 * @return {Promise<void>} Kết quả xử lý poll slot tabs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pollSlotTabs(slot) {
      try {
        const res = await fetch(`/screen/tabs/${slot}`);
        if (!res.ok) {
          browserTabsBar.style.display = 'none';
          return;
        }
        const data = await res.json();
        currentSlotTabs = data.tabs || [];
        if (currentSlotTabs.length > 0) {
          browserTabsBar.style.display = 'flex';
          browserTabsBar.innerHTML = currentSlotTabs.map((t, idx) => `
            <div class="browser-tab-chip ${t.active ? 'active' : ''}" onclick="switchSlotTab(${slot}, ${idx})">
              <span>🌐 ${t.title ? t.title.slice(0, 18) : 'Tab ' + (idx + 1)}</span>
              ${currentSlotTabs.length > 1 ? `<span class="browser-tab-close" onclick="event.stopPropagation(); closeSlotTab(${slot}, ${idx})">✕</span>` : ''}
            </div>
          `).join('') + `<button class="browser-tab-new" onclick="newSlotTab(${slot})">➕ Tab</button>`;
        } else {
          browserTabsBar.style.display = 'none';
        }
      } catch (err) {
        browserTabsBar.style.display = 'none';
      }
    }
