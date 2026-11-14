import { readGoLoginDeviceFingerprint } from './read-device-fingerprint.mjs';

/**
 * Ghi fingerprint thực tế một lần khi GoLogin sẵn sàng; lỗi đọc không làm gián đoạn phiên autofill.
 * @param {object} session Phiên GoLogin đã mở offer.
 * @param {object} gl Instance SDK của phiên.
 * @return {Promise<void>}
 */
export async function recordGoLoginDeviceFingerprint(session, gl) {
  try {
    const fingerprint = await readGoLoginDeviceFingerprint(session, gl);
    session.goLoginFingerprint = fingerprint;
    session.addBrowserLog?.({
      type: 'gologin_device_detected',
      ip: session.exitIp || null,
      detail: `IP ${session.exitIp || '?'} · ${session.deviceVersion || session.deviceProfile || 'Không rõ thiết bị'} · OS profile ${fingerprint.profileOs || '?'} · platform ${fingerprint.platform || '?'} · Orbita ${fingerprint.orbitaVersion || '?'} · UA ${fingerprint.userAgent || '?'}`,
      ...fingerprint
    });
  } catch (error) {
    session.addBrowserLog?.({ type: 'gologin_device_error', detail: `Không đọc được fingerprint thực tế từ Orbita (${String(error?.message || error).split('\n')[0].slice(0, 120)}); phiên vẫn tiếp tục.` });
  }
}
