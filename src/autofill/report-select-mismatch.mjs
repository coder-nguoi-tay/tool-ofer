const reportedStates = new WeakMap();

/**
 * Giải thích dropdown chưa điền được, chỉ ghi lại khi record/option/phạm vi thực sự đổi.
 * @param {object} owner Frame hoặc Page chứa dropdown.
 * @param {object} metadata Định danh và các option đang có.
 * @param {string[]} candidates Giá trị đã giải từ record, chỉ dùng so sánh trong RAM.
 * @param {object} result Kết quả chọn/xác minh dropdown.
 * @param {object} options Callback log của autofill.
 * @param {object} page Tab để liên kết bằng chứng nếu caller cần.
 * @return {void} Ghi một mốc chờ, không lặp cảnh báo mỗi lượt scan.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function reportSelectMismatch(owner, metadata, candidates, result, options, page) {
  // Trang đã chuyển ngay khi chọn (onchange điều hướng): không phải lỗi dropdown, không ghi log sai.
  if (result.reason === 'navigated') return;
  const identity = metadata.id || metadata.name || metadata.names?.[0] || 'select';
  const states = reportedStates.get(owner) || new Map();
  const signature = JSON.stringify([owner.url?.(), owner._activeAutofillFormScope?.id, candidates, metadata.options, result.reason]);
  if (states.get(identity) === signature) return;
  states.set(identity, signature);
  reportedStates.set(owner, states);
  const pendingReasons = { survey_options_unavailable: `Dropdown ${identity} chưa có lựa chọn hợp lệ; chờ tải dữ liệu hoặc AI hỗ trợ.`, survey_or_record_selection_pending: `Dropdown ${identity} chưa có đáp án; cần bộ giải khảo sát hoặc dữ liệu record.` };
  const detail = pendingReasons[result.reason] || (result.reason === 'option_unmatched'
    ? `Dropdown ${identity} chưa có option khớp dữ liệu record; giữ chưa hoàn tất để bộ giải/AI kiểm tra.`
    : `Dropdown ${identity} chưa chọn được (${result.reason || 'unknown'}); giữ chưa hoàn tất để bộ giải/AI kiểm tra.`);
  options.onLog?.({ type: 'select_value_unmatched', field: identity, reason: result.reason, detail }, page);
}
