// Smart Autofill Chips Injection

    window.injectAutofillText = async (text) => {
      if (!text) return;
      await sendInput({ type: 'insertText', text });
      showToast(`Đã điền: "${text.length > 20 ? text.slice(0, 18) + '...' : text}"`);
      try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
    };
