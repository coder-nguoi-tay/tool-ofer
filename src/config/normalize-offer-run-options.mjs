/**
 * Chuẩn hóa lựa chọn chạy được lưu theo offer, giữ cờ tắt chờ lead và các giá trị false.
 * @param {object} [options={}] Các trường cấu hình từ giao diện hoặc preset cũ.
 * @return {object} Chỉ các lựa chọn chạy được hỗ trợ, không chứa token hoặc dữ liệu phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function normalizeOfferRunOptions(options = {}) {
  const enableLeadCheck = options.enableLeadCheck === undefined
    ? options.HideUntilLead === true || options.stopAutofillOnLead === true
    : options.enableLeadCheck === true;
  const hideUntilLead = enableLeadCheck && options.HideUntilLead === true;
  const hideUntilTarget = !hideUntilLead && options.HideUntilTarget === true;
  return {
    runMode: ['auto', 'sequential', 'manual'].includes(options.runMode) ? options.runMode : 'auto',
    runInApp: !hideUntilLead && !hideUntilTarget && options.runInApp !== false,
    multiTab: options.multiTab !== false,
    CheckDuplicate: options.CheckDuplicate !== false,
    HideUntilLead: hideUntilLead,
    HideUntilTarget: hideUntilTarget,
    dataSaver: options.dataSaver !== false,
    enableChoiceDelay: options.enableChoiceDelay === true,
    choiceDelay: Math.max(1, Math.min(60, Math.trunc(Number(options.choiceDelay) || 2))),
    enableLeadCheck,
    stopAutofillOnLead: enableLeadCheck && options.stopAutofillOnLead === true,
  };
}
