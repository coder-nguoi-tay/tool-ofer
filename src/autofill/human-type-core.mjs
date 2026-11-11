import { ADJACENT_KEYS } from './state/adjacent-keys.mjs';
import { humanClick } from './human-click.mjs';
import { tryFastTextInput } from './interaction/try-fast-text-input.mjs';

/**
 * Rê chuột và click thành công trước khi nhập; slot sau ưu tiên fill đã xác minh để giữ tốc độ.
 * @param {object} field Locator của trường đang được điền.
 * @param {string} text Giá trị đã chọn từ record.
 * @param {object|null} page Tab Playwright sở hữu trường.
 * @param {object} options Tuỳ chọn nhịp gõ và mô phỏng lỗi gõ.
 * @return {Promise<void>} Hoàn tất điền hoặc trả về khi giá trị rỗng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function humanTypeCore(field, text, page = null, options = {}) {
  const str = String(text ?? '');
  if (!str) return;
  const activePage = page || (typeof field?.page === 'function' ? field.page() : null);
  if (activePage?._autofillMouseSlot > 1 && await tryFastTextInput(field, str, activePage)) return;
  const isRealBrowser = Boolean(activePage?.mouse && typeof activePage.mouse.move === 'function');
  const enableTypo = options.simulateTypo !== undefined ? Boolean(options.simulateTypo) : isRealBrowser;
  try {
    if (typeof field.scrollIntoViewIfNeeded === 'function') {
      await field.scrollIntoViewIfNeeded({
        timeout: 600
      }).catch(() => {});
    }
    if (activePage?.mouse && typeof field.boundingBox === 'function') {
      if (!await humanClick(activePage, field).catch(() => false)) return;
    } else {
      if (typeof field.hover === 'function') {
        await field.hover({
          timeout: 600
        }).catch(() => {});
      }
      if (typeof field.click === 'function') {
        await field.click({
          force: true,
          timeout: 1500
        }).catch(() => {});
      }
    }
    if (typeof field.focus === 'function') {
      await field.focus().catch(() => {});
    }
  } catch {}
  const prePause = Math.floor(Math.random() * 40) + 25;
  if (activePage && typeof activePage.waitForTimeout === 'function') {
    await activePage.waitForTimeout(prePause).catch(() => {});
  } else {
    await new Promise(r => setTimeout(r, prePause));
  }

  // Xóa nội dung cũ tự nhiên qua tổ hợp phím (Select All + Backspace) nếu trường đã có chữ
  try {
    const isMac = process.platform === 'darwin';
    const selectAllKey = isMac ? 'Meta+A' : 'Control+A';
    if (typeof field.press === 'function') {
      await field.press(selectAllKey).catch(() => {});
      await field.press('Backspace').catch(() => {});
    } else if (activePage?.keyboard) {
      await activePage.keyboard.press(selectAllKey).catch(() => {});
      await activePage.keyboard.press('Backspace').catch(() => {});
    }
  } catch {}

  // Đảm bảo không còn ký tự cũ sót lại để tránh ghép nối chuỗi không mong muốn
  if (typeof field.evaluate === 'function') {
    await field.evaluate(el => {
      if (el && el.value) {
        el.value = '';
        el.dispatchEvent(new Event('input', {
          bubbles: true
        }));
      }
    }).catch(() => {});
  }

  // Nhịp gõ thích ứng theo đặc tính nội dung
  const digitsOnly = str.replace(/[\s\(\)\-\.]/g, '');
  const isDigitsOnly = /^\d+$/.test(digitsOnly);
  const isNameOrEmail = !isDigitsOnly && (/@/.test(str) || /^[a-zA-Z\s'-]+$/.test(str));

  // Gõ tuần tự từng ký tự mô phỏng nhịp gõ phím của người thật kèm giả lập gõ nhầm (Typo Simulation)
  let typedOk = false;
  if (activePage?.keyboard && typeof activePage.keyboard.type === 'function') {
    try {
      let typoDone = false;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        // Nhịp gõ người thật nhanh và mượt mà: 45-85ms/ký tự, có biến động tự nhiên
        let charDelay = isNameOrEmail ? Math.floor(Math.random() * 35) + 45 : isDigitsOnly ? Math.floor(Math.random() * 30) + 50 : Math.floor(Math.random() * 35) + 45;
        if ([' ', '@', '.', '-', '_', '/'].includes(char)) {
          charDelay += Math.floor(Math.random() * 40) + 40; // Nhịp dừng trước dấu đặc biệt: 80-120ms
        } else if (isDigitsOnly && digitsOnly.length >= 10 && (i === 3 || i === 6)) {
          // Ngắt nhịp nhẹ giữa các cụm số điện thoại (Area code & Prefix)
          charDelay += Math.floor(Math.random() * 60) + 80;
        }

        // Nhịp thở tự nhiên nhẹ nhàng
        if (Math.random() < 0.02) {
          charDelay += Math.floor(Math.random() * 80) + 60;
        }

        // Typo simulation: chỉ bật khi chạy trên browser thật hoặc cấu hình rõ ràng, xác suất ~1.2%, tối đa 1 typo mỗi trường, không áp dụng sau dấu @
        const lower = char.toLowerCase();
        const adjacent = ADJACENT_KEYS[lower];
        const canTypo = enableTypo && !typoDone && adjacent?.length && i > 1 && i < str.length - 1 && !str.slice(i).includes('@') && (options.forceTypo || Math.random() < 0.012);
        if (canTypo) {
          typoDone = true;
          const wrongChar = adjacent[Math.floor(Math.random() * adjacent.length)];
          const typedWrong = char === char.toUpperCase() ? wrongChar.toUpperCase() : wrongChar;
          await activePage.keyboard.type(typedWrong, {
            delay: charDelay
          }).catch(() => {});
          const hesitate = Math.floor(Math.random() * 100) + 110;
          await new Promise(r => setTimeout(r, hesitate));
          await activePage.keyboard.press('Backspace').catch(() => {});
          const fixPause = Math.floor(Math.random() * 35) + 40;
          await new Promise(r => setTimeout(r, fixPause));
        }
        await activePage.keyboard.type(char, {
          delay: charDelay
        });
      }
      typedOk = true;
    } catch {
      typedOk = false;
    }
  } else if (typeof field.pressSequentially === 'function') {
    try {
      let typoDone = false;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        // Nhịp gõ người thật (bản pressSequentially): đồng bộ với nhánh keyboard.type
        let charDelay = isNameOrEmail ? Math.floor(Math.random() * 80) + 110 : isDigitsOnly ? Math.floor(Math.random() * 70) + 130 : Math.floor(Math.random() * 80) + 115;
        if ([' ', '@', '.', '-', '_', '/'].includes(char)) {
          charDelay += Math.floor(Math.random() * 80) + 90;
        } else if (isDigitsOnly && digitsOnly.length >= 10 && (i === 3 || i === 6)) {
          charDelay += Math.floor(Math.random() * 120) + 220;
        }
        if (Math.random() < 0.04) {
          charDelay += Math.floor(Math.random() * 250) + 200;
        }
        const lower = char.toLowerCase();
        const adjacent = ADJACENT_KEYS[lower];
        const canTypo = enableTypo && !typoDone && adjacent?.length && i > 1 && i < str.length - 1 && !str.slice(i).includes('@') && (options.forceTypo || Math.random() < 0.012);
        if (canTypo) {
          typoDone = true;
          const wrongChar = adjacent[Math.floor(Math.random() * adjacent.length)];
          const typedWrong = char === char.toUpperCase() ? wrongChar.toUpperCase() : wrongChar;
          await field.pressSequentially(typedWrong, {
            delay: charDelay
          }).catch(() => {});
          const hesitate = Math.floor(Math.random() * 100) + 110;
          await new Promise(r => setTimeout(r, hesitate));
          if (typeof field.press === 'function') {
            await field.press('Backspace').catch(() => {});
          }
          const fixPause = Math.floor(Math.random() * 35) + 40;
          await new Promise(r => setTimeout(r, fixPause));
        }
        await field.pressSequentially(char, {
          delay: charDelay
        });
      }
      typedOk = true;
    } catch {
      typedOk = false;
    }
  }

  // Fallback an toàn nếu chưa gõ được qua keyboard/pressSequentially
  if (!typedOk && typeof field.pressSequentially === 'function') {
    try {
      await field.pressSequentially(str, {
        delay: Math.floor(Math.random() * 60) + 110
      });
      typedOk = true;
    } catch {}
  }
  if (!typedOk && typeof field.fill === 'function') {
    try {
      await field.fill(str, {
        force: true,
        timeout: 2500
      });
      typedOk = true;
    } catch {}
  }

  // Kiểm tra lại giá trị sau khi gõ: nếu rỗng (do mask hoặc validator trang), đặt qua property descriptor
  let postVal = '';
  if (typeof field.inputValue === 'function') {
    postVal = await field.inputValue().catch(() => '');
  }
  if ((!postVal || postVal.trim() === '') && typeof field.evaluate === 'function') {
    await field.evaluate((el, val) => {
      const proto = (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) ? HTMLInputElement.prototype : ((typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype : Object.getPrototypeOf(el || {}));
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc?.set) {
        desc.set.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', {
        bubbles: true
      }));
      el.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    }, str).catch(() => {});
  }

  // Đảm bảo kích hoạt đầy đủ input, change, blur để các framework cập nhật validation và enable nút submit
  if (typeof field.evaluate === 'function') {
    await field.evaluate(el => {
      try {
        el.dispatchEvent(new Event('input', {
          bubbles: true
        }));
      } catch {}
      try {
        el.dispatchEvent(new Event('change', {
          bubbles: true
        }));
      } catch {}
      try {
        el.dispatchEvent(new Event('blur', {
          bubbles: true
        }));
      } catch {}
    }).catch(() => {});
  }
  if (typeof field.blur === 'function') {
    await field.blur().catch(() => {});
  }

  // Dừng siêu ngắn tự nhiên sau khi gõ xong trường (25ms - 50ms)
  const postPause = Math.floor(Math.random() * 25) + 25;
  if (activePage && typeof activePage.waitForTimeout === 'function') {
    await activePage.waitForTimeout(postPause).catch(() => {});
  } else {
    await new Promise(r => setTimeout(r, postPause));
  }
}
export { humanTypeCore };
