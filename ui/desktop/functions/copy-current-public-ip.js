/**
 * Copy current public ip.
 * @return {Promise<void>} Kết quả xử lý copy current public ip.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function copyCurrentPublicIp() {
      const ip = document.getElementById('lbl711MyIp')?.textContent?.trim();
      if (!ip || ip.includes('...')) return;
      try {
        await navigator.clipboard.writeText(ip);
        showWinAlert(`Đã sao chép IP ${ip} vào bộ nhớ tạm.`);
      } catch {
        prompt('Copy IP:', ip);
      }
    }
