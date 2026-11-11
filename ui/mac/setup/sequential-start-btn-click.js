// ── Chế độ tuần tự ────────────────────────────────────────────────────
    document.querySelector('#sequential-start-btn').addEventListener('click', async () => {
      const btn = document.querySelector('#sequential-start-btn');
      btn.disabled = true;
      try {
        // Không gửi autofillData/proxyList (server đã có queue) — chỉ gửi config nhỏ
        const full = buildRequestBody();
        const settings = {
          websiteUrl: full.websiteUrl,
          websiteUrl2: full.websiteUrl2,
          proxyType: full.proxyType,
          autoSubmitForm: full.autoSubmitForm,
          enableLeadCheck: full.enableLeadCheck,
          leadCheckScreen: full.leadCheckScreen || 4,
          leadCheckApiUrl: full.leadCheckApiUrl,
          leadCheckCookie: full.leadCheckCookie,
          leadCheckDatas: full.leadCheckDatas,
          leadCheckInterval: full.leadCheckInterval,
          leadCheckMaxAttempts: full.leadCheckMaxAttempts,
          autoCloseNoLead: full.autoCloseNoLead,
        };
        const res = await fetch('/auto-refill/sequential', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true, settings }),
        }).then((r) => r.json());
        autoRefillStatus.textContent = res.message;
      } catch (err) {
        autoRefillStatus.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
