/**
 * Hiển thị các tab của slot và cho người dùng trả lời hộp thoại trên tab đang xem.
 * @param {number} slot Slot đang mở trong Mini.
 * @return {Promise<void>} Hoàn tất cập nhật thanh tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function pollSlotTabs(slot) {
      if (currentSlot !== slot) return;
      const request = {};
      browserTabsBar._latestTabRequest = request;
      try {
        const res = await fetch(`/screen/tabs/${slot}`);
        const data = res.ok ? await res.json() : null;
        if (slot !== currentSlot || browserTabsBar._latestTabRequest !== request) return;
        currentSlotTabs = data?.tabs || [];
        if (currentSlotTabs.length > 0) {
          browserTabsBar.style.display = 'flex';
          browserTabsBar.innerHTML = currentSlotTabs.map((t, idx) => `
            <div class="browser-tab-chip ${t.active ? 'active' : ''}" onclick="switchSlotTab(${slot}, ${idx})">
              <span class="browser-tab-label"></span>
              ${currentSlotTabs.length > 1 ? `<span class="browser-tab-close" onclick="event.stopPropagation(); closeSlotTab(${slot}, ${idx})">✕</span>` : ''}
            </div>
          `).join('') + `<button class="browser-tab-new" onclick="newSlotTab(${slot})">➕ Tab</button>`;
          const labels = browserTabsBar.querySelectorAll('.browser-tab-label');
          for (const [index, label] of labels.entries()) {
            const tab = currentSlotTabs[index];
            const title = tab.title || 'Tab ' + (index + 1);
            label.textContent = '🌐 ' + title.slice(0, 18);
            label.title = tab.url || title;
          }
          for (const tab of currentSlotTabs) {
            if (!tab.active || !tab.manualDialog) continue;
            const pending = tab.manualDialog;
            const answerButton = document.createElement('button');
            answerButton.textContent = 'Trả lời hộp thoại · Tab ' + (tab.index + 1);
            /**
             * Gửi quyết định của người dùng cho hộp thoại đang hiển thị.
             * @return {Promise<void>} Hiển thị lỗi hoặc cập nhật danh sách sau khi trả lời.
             * @author ductv <ductv@getflycrm.com>
             * @since 2026-11-20
             */
            answerButton.onclick = async () => {
              if (currentSlot !== slot || !answerButton.isConnected) return;
              answerButton.disabled = true;
              const answer = pending.type === 'prompt' ? window.prompt(pending.message, pending.defaultValue) : window.confirm(pending.message);
              try {
                const response = await fetch('/screen/input/' + slot, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'dialog', dialogId: pending.id,
                    accept: pending.type === 'prompt' ? answer !== null : answer,
                    promptText: pending.type === 'prompt' ? answer : '' }),
                });
                if (!response.ok && currentSlot === slot) showToast('Chưa gửi được câu trả lời. Kiểm tra lại hộp thoại.');
              } catch {
                if (currentSlot === slot) showToast('Mất kết nối khi gửi câu trả lời.');
              }
              await pollSlotTabs(slot);
            };
            browserTabsBar.appendChild(answerButton);
          }
        } else {
          browserTabsBar.style.display = 'none';
        }
      } catch {
        if (slot === currentSlot && browserTabsBar._latestTabRequest === request) browserTabsBar.style.display = 'none';
      }
    }
