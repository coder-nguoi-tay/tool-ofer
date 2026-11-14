/**
 * Đồng bộ IP và thiết bị vào metadata phiên để mọi chế độ ghi log đều giữ được sau khi đóng trình duyệt.
 * @param {object} recording Bản ghi được lưu trong browser-logs.json.
 * @param {object} session Phiên trình duyệt hiện tại.
 * @return {void}
 */
export function syncBrowserLogSessionMetadata(recording, session) {
  recording.ip = session.exitIp ?? recording.ip ?? '?';
  recording.offer = session.offerNumber ?? session.streamRole ?? recording.offer ?? 1;
  recording.offerUrl = session.websiteUrl ?? recording.offerUrl ?? '';
  recording.version = session.chromeVersion ?? recording.version ?? 'stable';
  recording.deviceProfile = session.deviceProfile ?? recording.deviceProfile ?? null;
  recording.deviceVersion = session.deviceVersion ?? recording.deviceVersion ?? null;
  recording.deviceSummary = session.deviceSummary ?? recording.deviceSummary ?? null;
  const fingerprint = session.goLoginFingerprint;
  if (!fingerprint) return;
  recording.goLoginOs = fingerprint.profileOs;
  recording.goLoginOrbitaVersion = fingerprint.orbitaVersion;
  recording.goLoginPlatform = fingerprint.platform;
  recording.goLoginUserAgent = fingerprint.userAgent;
  recording.goLoginUaPlatform = fingerprint.uaPlatform;
  recording.goLoginUaPlatformVersion = fingerprint.uaPlatformVersion;
  recording.goLoginUaMobile = fingerprint.uaMobile;
  recording.goLoginTouchPoints = fingerprint.touchPoints;
}
