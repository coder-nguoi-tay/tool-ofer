import { EventEmitter } from 'node:events';
import { attachBrowserLogger } from '../actions/attach-browser-logger.mjs';

/**
 * Tạo nhật ký trước SDK/CDP/IP; relay giữ cùng một recording khi kết nối CDP được thay thế.
 * @param {object} session Metadata phiên chưa cần có browser.
 * @param {string} provider Tên engine được ghi nhận trong mốc khởi tạo.
 * @return {void} Gắn callback log, bind context và chốt recording đúng một lần.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function startGoLoginSessionRecording(session, provider = 'GoLogin') {
  const relay = new EventEmitter();
  const bound = new WeakSet();
  let finished = false;
  relay.pages = () => session.browser?.pages?.() || [];
  relay.browser = () => null;
  attachBrowserLogger(relay, session);
  session.bindRecordingContext = context => {
    if (bound.has(context)) return;
    bound.add(context);
    context.on('page', page => relay.emit('page', page));
    context.pages().forEach(page => relay.emit('page', page));
  };
  session.finishRecording = () => {
    if (finished) return;
    finished = true;
    relay.emit('close');
  };
  session.addBrowserLog({ type: provider === 'Obscura' ? 'obscura_starting' : 'gologin_starting', detail: `Bắt đầu mở profile ${provider}.` });
}

/**
 * Ghi nguyên nhân theo pha trước khi dừng SDK; không đưa token/proxy/URL từ lỗi SDK vào log.
 * @param {object} session Phiên đang khởi tạo.
 * @param {Error} error Lỗi khởi tạo.
 * @return {void} Ghi một lỗi gốc cho mỗi lượt mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function recordGoLoginStartupFailure(session, error) {
  if (session.startupFailureLogged) return;
  session.startupFailureLogged = true;
  const phases = { profile_create: 'tạo profile', sdk_start: 'khởi chạy Orbita', cdp_connect: 'kết nối CDP',
    window_setup: 'cấu hình cửa sổ', verify_ip: 'xác minh IP', runtime_setup: 'gắn autofill' };
  const reasons = { GOLOGIN_IP_MISMATCH: 'IP trong Orbita khác IP proxy đã kiểm tra', GOLOGIN_IP_UNAVAILABLE: 'không đọc được IP trong Orbita',
    GOLOGIN_PROFILE_LIMIT: 'GoLogin từ chối tạo profile, tài khoản đã đủ số profile tối đa của gói; xóa bớt profile trên GoLogin hoặc giảm số luồng' };
  const httpStatus = String(error.message || '').match(/(?:HTTP|status)[^0-9]{0,10}([45][0-9]{2})/i)?.[1];
  session.addBrowserLog?.({ type: 'gologin_start_failed', errorName: error.name, reasonCode: error.code,
    expectedExitIp: error.expectedIp, actualExitIp: error.detectedIp,
    detail: `Mở GoLogin thất bại tại bước ${phases[session.startupPhase] || session.startupPhase || 'không xác định'}: ${reasons[error.code] || error.code || error.name || 'Error'}${httpStatus ? ` (HTTP ${httpStatus})` : ''}; dừng phiên khởi tạo.` });
}
