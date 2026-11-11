/**
 * Show touch ripple.
 * @param {*} x x.
 * @param {*} y y.
 * @param {boolean} isRight is right.
 * @return {void} Kết quả xử lý show touch ripple.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function showTouchRipple(x, y, isRight = false) {
      const ripple = document.createElement('div');
      ripple.className = 'touch-ripple' + (isRight ? ' ripple-right' : '');
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      viewport.appendChild(ripple);
      setTimeout(() => ripple.remove(), 420);
      try { tg?.HapticFeedback?.impactOccurred(isRight ? 'medium' : 'light'); } catch (e) {}
    }
