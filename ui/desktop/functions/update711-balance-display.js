/**
 * Update711 balance display.
 * @param {*} data data.
 * @return {void} Kết quả xử lý update711 balance display.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function update711BalanceDisplay(data) {
      if (!data) return;
      window.cached711Balance = data;
      const ok = Boolean(data.ok);
      const pkgFormatted = data.packageFormatted || (data.packageGb ? `${data.packageGb.toFixed(2)} GB` : '--');
      const usedFormatted = data.usedFormatted || (data.usedGb !== undefined ? `${data.usedGb.toFixed(2)} GB` : '--');
      const remFormatted = data.remainingFormatted || (data.remainingGb !== undefined ? `${data.remainingGb.toFixed(2)} GB` : '--');
      const usedPct = data.usedPercent !== undefined ? data.usedPercent : 0;
      const remPct = data.remainingPercent !== undefined ? data.remainingPercent : 0;
      const bytes = data.flow_balance || 0;

      // Update Top Status Bar chip
      const elRun711 = document.getElementById('runStat711Remaining');
      if (elRun711) {
        elRun711.textContent = ok ? remFormatted : '--';
      }

      // Update Proxy Tab Label
      const elLblBal = document.getElementById('lbl711Balance');
      if (elLblBal) {
        if (ok) {
          elLblBal.innerHTML = `Số dư: <b style="color:#34d399;">${remFormatted}</b> / Gói: <b>${pkgFormatted}</b> (Đã dùng: ${usedFormatted})`;
        } else if (data.error) {
          elLblBal.textContent = data.error;
        }
      }

      // Update Bandwidth Modal Elements
      const elTotal = document.getElementById('bw711Total');
      if (elTotal) elTotal.textContent = ok ? pkgFormatted : '--';

      const elUsed = document.getElementById('bw711Used');
      if (elUsed) elUsed.textContent = ok ? usedFormatted : '--';

      const elUsedPct = document.getElementById('bw711UsedPct');
      if (elUsedPct) elUsedPct.textContent = `${usedPct}%`;

      const elRemaining = document.getElementById('bw711Remaining');
      if (elRemaining) elRemaining.textContent = ok ? remFormatted : '--';

      const elRemSub = document.getElementById('bw711RemainingSub');
      if (elRemSub) {
        elRemSub.textContent = ok ? `${bytes.toLocaleString()} Bytes` : (data.error || 'Chưa có dữ liệu');
      }

      const elBar = document.getElementById('bw711ProgressBar');
      if (elBar) {
        elBar.style.width = `${Math.min(100, Math.max(0, remPct))}%`;
        if (remPct <= 5) {
          elBar.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
        } else if (remPct <= 20) {
          elBar.style.background = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
        } else {
          elBar.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
        }
      }

      const elProgText = document.getElementById('bw711ProgressText');
      if (elProgText) elProgText.textContent = `${usedPct}% đã dùng (${usedFormatted})`;

      const elRemText = document.getElementById('bw711RemainingText');
      if (elRemText) elRemText.textContent = `${remPct}% còn lại (${remFormatted})`;

      const elBadge = document.getElementById('bw711Badge');
      if (elBadge) {
        if (ok) {
          elBadge.className = 'live-pill';
          elBadge.style.background = 'rgba(16, 185, 129, 0.18)';
          elBadge.style.color = '#34d399';
          elBadge.style.border = '1px solid rgba(52, 211, 153, 0.3)';
          elBadge.innerHTML = '<span class="live-dot" style="background:#10b981;"></span> Đã kết nối';
        } else {
          elBadge.className = 'live-pill';
          elBadge.style.background = 'rgba(239, 68, 68, 0.18)';
          elBadge.style.color = '#f87171';
          elBadge.style.border = '1px solid rgba(248, 113, 113, 0.3)';
          elBadge.innerHTML = '⚠️ Chưa kết nối';
        }
      }

      const elTime = document.getElementById('bw711UpdatedTime');
      if (elTime && data.lastUpdated) {
        const d = new Date(data.lastUpdated);
        elTime.textContent = `(${d.toLocaleTimeString('vi-VN')})`;
      }

      const inpCustom = document.getElementById('inp711CustomPackageGb');
      if (inpCustom && data.packageGb && !inpCustom.value) {
        inpCustom.value = data.packageGb;
      }
    }
