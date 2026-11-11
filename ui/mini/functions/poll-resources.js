/**
 * Poll resources.
 * @return {Promise<void>} Kết quả xử lý poll resources.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pollResources() {
      try {
        const [pq, eq, afq, state] = await Promise.all([
          fetch('/proxy-queue').then((r) => r.json()).catch(() => ({})),
          fetch('/email-queue').then((r) => r.json()).catch(() => ({})),
          fetch('/autofill-queue').then((r) => r.json()).catch(() => ({})),
          fetch('/state').then((r) => r.json()).catch(() => ({})),
        ]);
        document.getElementById('textProxyAvail').textContent = pq.available ?? 0;
        document.getElementById('textProxyUsed').textContent = pq.used ?? 0;
        document.getElementById('textEmailAvail').textContent = eq.available ?? 0;
        document.getElementById('textEmailUsed').textContent = eq.used ?? 0;

        const afAvail = afq.available ?? 0;
        const afUsed = afq.used ?? 0;
        document.getElementById('badgeAutofillCount').textContent = afAvail + afUsed;
        document.getElementById('textAutofillAvail').textContent = afAvail;
        document.getElementById('textAutofillUsed').textContent = afUsed;

        const p711 = state?.bandwidth?.proxy711 || {};
        document.getElementById('badge711Balance').textContent = p711.remainingFormatted || (p711.remainingGb ? p711.remainingGb + ' GB' : '-- GB');
        document.getElementById('text711Package').textContent = p711.packageFormatted || '--';
        document.getElementById('text711Used').textContent = p711.usedFormatted || '--';
        document.getElementById('text711Remaining').textContent = p711.remainingFormatted || '--';
      } catch (e) {}
    }
