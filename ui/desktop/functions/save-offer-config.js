/**
 * Lưu cấu hình offer và số luồng đã nhập để khôi phục ở lần mở sau.
 * @param {boolean} [silent=false] Ẩn thông báo lỗi trên giao diện.
 * @return {Promise<object|undefined>} Phản hồi lưu cấu hình nếu đã nhập link offer.
 * @throws {Error} Khi yêu cầu lưu cấu hình thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function saveOfferConfig(silent = false) {
  const name = document.getElementById('txtNameOffer')?.value.trim() || '';
  const link1 = document.getElementById('txtLinkOffer')?.value.trim() || '';
  const link2 = document.getElementById('txtLinkOffer2')?.value.trim() || '';
  const link3 = document.getElementById('txtLinkOffer3')?.value.trim() || '';
  const link4 = document.getElementById('txtLinkOffer4')?.value.trim() || '';

  if (!link1 && !link2 && !link3 && !link4) {
    if (!silent) showWinAlert('Vui lòng nhập ít nhất Link Offer 1 trước khi bấm Lưu!');
    return;
  }

  const methodConfigs = [
    { offerNumber: 1, link: link1 || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' },
    { offerNumber: 2, link: link2 || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' },
    { offerNumber: 3, link: link3 || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' },
    { offerNumber: 4, link: link4 || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' },
  ];

  const payload = {
    NameOffer: name || (link1 ? link1.split('\n')[0].slice(0, 35) : 'Offer Mới'),
    LinkOffer: link1,
    LinkOffer2: link2,
    LinkOffer3: link3,
    LinkOffer4: link4,
    MaxRunMinutes: document.getElementById('txtTimeLimit')?.value ?? '10',
    Complete: document.getElementById('txtTextComplete')?.value || '',
    delayStart: document.getElementById('nudDelayStart')?.value || '1',
    delayStop: document.getElementById('nudDelayStop')?.value || '1',
    Thread: normalizeRequestedThreadCount(document.getElementById('nudThread')?.value),
    LimitRun: document.getElementById('nudLimitRun')?.value || '0',
    CheckDuplicate: document.getElementById('cbxCheckDuplicateIP')?.checked ?? true,
    HideUntilTarget: document.getElementById('cbxHideUntilTarget')?.checked ?? false,
    HideUntilLead: document.getElementById('cbxHideUntilLead')?.checked ?? false,
    runInApp: document.getElementById('cbxRunInApp')?.checked ?? true,
    runMode: document.getElementById('cbxAuto')?.value || 'auto',
    multiTab: document.getElementById('cbxMultiTab')?.checked ?? true,
    dataSaver: document.getElementById('cbxDataSaver')?.checked ?? true,
    enableChoiceDelay: Boolean(document.getElementById('cbxChoiceDelay')?.checked || document.getElementById('cbxChoiceDelayPill')?.checked),
    choiceDelay: parseInt(document.getElementById('nudChoiceDelay')?.value, 10) || 2,
    enableLeadCheck: Boolean(document.getElementById('cbxCheckLead')?.checked),
    stopAutofillOnLead: Boolean(document.getElementById('cbxStopAutofillOnLead')?.checked),
    offerSolver: document.getElementById('cbbOfferSolver')?.value || 'auto',
    schedules: typeof getOfferScheduleSettings === 'function' ? getOfferScheduleSettings() : [],
    scheduleStop: typeof getScheduleStopSettings === 'function' ? getScheduleStopSettings() : null,
    methodConfigs: methodConfigs,
  };

  try {
    localStorage.setItem('autoleadpc_current_offer', JSON.stringify(payload));
    localStorage.setItem('autoleadpc_run_mode', payload.runMode);
    localStorage.setItem('autoleadpc_multi_tab', String(payload.multiTab));
    localStorage.setItem('autoleadpc_data_saver', String(payload.dataSaver));
    localStorage.setItem('autoleadpc_thread_count', String(payload.Thread));
    localStorage.setItem('autoleadpc_limit_run', String(payload.LimitRun));
    localStorage.setItem('autoleadpc_offer_solver', payload.offerSolver);
    localStorage.setItem('autoleadpc_enable_choice_delay', String(payload.enableChoiceDelay));
    localStorage.setItem('autoleadpc_choice_delay_seconds', String(payload.choiceDelay));
    localStorage.setItem('autoleadpc_check_lead', String(payload.enableLeadCheck));
    localStorage.setItem('autoleadpc_stop_autofill_on_lead', String(payload.stopAutofillOnLead));
    localStorage.setItem('autoleadpc_run_in_app', String(payload.runInApp));
    localStorage.setItem('autoleadpc_hide_until_target', String(payload.HideUntilTarget));
    localStorage.setItem('autoleadpc_hide_until_lead', String(payload.HideUntilLead));
  } catch { }

  const res = await api('/pc/offer/save', { method: 'POST', body: JSON.stringify(payload) });
  if (res && res.success) {
    if (Array.isArray(res.savedList)) {
      currentSavedOffers = res.savedList;
      renderSavedOffersDropdown(currentSavedOffers, res.savedItem?.id || payload.NameOffer);
    }
    const statusEl = document.getElementById('offerSaveStatus');
    if (statusEl) {
      statusEl.textContent = '✓ Đã lưu Offer thành công!';
      statusEl.style.display = 'inline';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3500);
    }
    document.getElementById('lbStatus').textContent = `Đã lưu Offer: ${payload.NameOffer}`;
  } else if (!silent) {
    showWinAlert('Không thể lưu Offer: ' + (res?.error || 'Lỗi không xác định'));
  }
  return res;
}
