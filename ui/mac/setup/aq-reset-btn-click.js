document.querySelector('#aq-reset-btn').addEventListener('click', async () => {
      const res = await fetch('/autofill-queue/reset', { method: 'POST' }).then((r) => r.json());
      status.textContent = res.message ?? 'Đã đặt lại.';
      await refreshAutofillQueue();
    });
