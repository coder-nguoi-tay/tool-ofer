/**
 * So sánh snapshot quan sát được với các giá trị kỳ vọng, phân loại mức độ nghiêm trọng.
 *
 * @param {object} snapshot Dữ liệu thu thập từ collectProfileCoherenceSnapshot.
 * @param {object} expected Dữ liệu kỳ vọng từ buildProfileCoherenceExpected.
 * @return {object} { consistent: boolean, score: number, mismatches: Array }
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function analyzeProfileCoherence(snapshot, expected) {
  if (!snapshot || snapshot.error || !expected) {
    return {
      consistent: false,
      score: 0,
      mismatches: [{
        key: 'snapshot',
        expected: 'valid_snapshot',
        observed: snapshot?.error || 'null',
        severity: 'critical',
        message: `Không thu thập được snapshot fingerprint: ${snapshot?.error || 'không có dữ liệu'}`
      }]
    };
  }
  const mismatches = [];

  // 1. Webdriver: không được phép lộ true
  if (snapshot.webdriver === true) {
    mismatches.push({
      key: 'webdriver',
      expected: false,
      observed: true,
      severity: 'critical',
      message: 'navigator.webdriver bị lộ true (dấu hiệu bot automation)'
    });
  }

  // 2. Platform (Win32, MacIntel, Linux x86_64, iPhone...)
  if (expected.platform && snapshot.platform && snapshot.platform !== expected.platform) {
    mismatches.push({
      key: 'platform',
      expected: expected.platform,
      observed: snapshot.platform,
      severity: 'high',
      message: `navigator.platform (${snapshot.platform}) không khớp cấu hình máy (${expected.platform})`
    });
  }

  // 3. UserAgent Platform coherence
  if (expected.userAgentContains && snapshot.userAgent && !snapshot.userAgent.includes(expected.userAgentContains)) {
    mismatches.push({
      key: 'userAgent',
      expected: `chứa "${expected.userAgentContains}"`,
      observed: snapshot.userAgent.slice(0, 80),
      severity: 'high',
      message: `navigator.userAgent không chứa từ khóa hệ điều hành kỳ vọng (${expected.userAgentContains})`
    });
  }

  // 4. Client Hints Platform vs UA Platform
  if (expected.uaPlatform && snapshot.clientHints?.platform && snapshot.clientHints.platform !== expected.uaPlatform) {
    mismatches.push({
      key: 'clientHintsPlatform',
      expected: expected.uaPlatform,
      observed: snapshot.clientHints.platform,
      severity: 'high',
      message: `sec-ch-ua-platform (${snapshot.clientHints.platform}) lệch với profile (${expected.uaPlatform})`
    });
  }

  // 5. Hardware Concurrency
  if (expected.hardwareConcurrency && snapshot.hardwareConcurrency && snapshot.hardwareConcurrency !== expected.hardwareConcurrency) {
    mismatches.push({
      key: 'hardwareConcurrency',
      expected: expected.hardwareConcurrency,
      observed: snapshot.hardwareConcurrency,
      severity: 'medium',
      message: `hardwareConcurrency (${snapshot.hardwareConcurrency}) lệch giá trị spoof (${expected.hardwareConcurrency})`
    });
  }

  // 6. WebGL Renderer
  if (expected.webglRenderer && snapshot.webgl?.renderer && snapshot.webgl.renderer !== expected.webglRenderer) {
    mismatches.push({
      key: 'webglRenderer',
      expected: expected.webglRenderer,
      observed: snapshot.webgl.renderer,
      severity: 'medium',
      message: `WebGL Renderer (${snapshot.webgl.renderer}) lệch GPU profile (${expected.webglRenderer})`
    });
  }

  // 7. Timezone
  if (expected.timezone && snapshot.timezone && snapshot.timezone !== expected.timezone) {
    mismatches.push({
      key: 'timezone',
      expected: expected.timezone,
      observed: snapshot.timezone,
      severity: 'medium',
      message: `Múi giờ (${snapshot.timezone}) lệch với timezone proxy/profile (${expected.timezone})`
    });
  }

  // 8. MaxTouchPoints
  if (typeof expected.maxTouchPoints === 'number' && typeof snapshot.maxTouchPoints === 'number') {
    if (expected.isMobile && snapshot.maxTouchPoints === 0) {
      mismatches.push({
        key: 'maxTouchPoints',
        expected: '> 0',
        observed: 0,
        severity: 'high',
        message: 'Thiết bị mobile nhưng maxTouchPoints = 0 (lộ desktop)'
      });
    } else if (!expected.isMobile && snapshot.maxTouchPoints > 0 && expected.maxTouchPoints === 0) {
      mismatches.push({
        key: 'maxTouchPoints',
        expected: 0,
        observed: snapshot.maxTouchPoints,
        severity: 'low',
        message: `Desktop giả lập nhưng có maxTouchPoints = ${snapshot.maxTouchPoints}`
      });
    }
  }

  // 9. Ngôn ngữ chính
  if (expected.languages && expected.languages.length > 0 && Array.isArray(snapshot.languages) && snapshot.languages.length > 0) {
    const primaryExpected = expected.languages[0].toLowerCase();
    const primaryObserved = (snapshot.languages[0] || '').toLowerCase();
    if (primaryExpected !== primaryObserved && !primaryObserved.startsWith(primaryExpected.split('-')[0])) {
      mismatches.push({
        key: 'languages',
        expected: expected.languages[0],
        observed: snapshot.languages[0],
        severity: 'low',
        message: `Ngôn ngữ ưu tiên (${snapshot.languages[0]}) không khớp locale proxy (${expected.languages[0]})`
      });
    }
  }

  // 10. Notification Permission Coherence (lệch Notification.permission vs permissions.query)
  if (snapshot.notificationPermission === 'default' && snapshot.notificationQueryState === 'denied') {
    mismatches.push({
      key: 'notificationPermission',
      expected: 'prompt',
      observed: 'denied',
      severity: 'critical',
      message: 'Notification.permission là "default" nhưng query({ name: "notifications" }) trả về "denied" (dấu hiệu lộ automation/CreepJS)'
    });
  }

  // 11. Chrome object parity
  if (typeof expected.hasChromeObject === 'boolean' && typeof snapshot.hasChromeObject === 'boolean') {
    if (expected.hasChromeObject && !snapshot.hasChromeObject) {
      mismatches.push({
        key: 'hasChromeObject',
        expected: true,
        observed: false,
        severity: 'high',
        message: 'Trình duyệt Chromium nhưng thiếu window.chrome hoặc window.chrome.csi'
      });
    } else if (!expected.hasChromeObject && snapshot.hasChromeObject) {
      mismatches.push({
        key: 'hasChromeObject',
        expected: false,
        observed: true,
        severity: 'medium',
        message: 'Profile WebKit/iOS nhưng lại tồn tại window.chrome'
      });
    }
  }

  // 12. pdfViewerEnabled parity
  if (typeof expected.pdfViewerEnabled === 'boolean' && typeof snapshot.pdfViewerEnabled === 'boolean') {
    if (expected.pdfViewerEnabled !== snapshot.pdfViewerEnabled) {
      mismatches.push({
        key: 'pdfViewerEnabled',
        expected: expected.pdfViewerEnabled,
        observed: snapshot.pdfViewerEnabled,
        severity: 'medium',
        message: `navigator.pdfViewerEnabled (${snapshot.pdfViewerEnabled}) không khớp loại thiết bị (${expected.pdfViewerEnabled ? 'Desktop' : 'Mobile/iOS'})`
      });
    }
  }

  // 13. Plugins parity (Desktop Chromium phải có plugin PDF)
  if (expected.hasPlugins === true && typeof snapshot.pluginsLength === 'number' && snapshot.pluginsLength === 0) {
    mismatches.push({
      key: 'plugins',
      expected: '> 0',
      observed: 0,
      severity: 'medium',
      message: 'Desktop Chromium nhưng navigator.plugins rỗng (dấu hiệu headless)'
    });
  }

  // 14. MediaDevices rỗng trên Desktop
  if (typeof snapshot.mediaDevicesCount === 'number' && snapshot.mediaDevicesCount === 0 && !expected.isMobile) {
    mismatches.push({
      key: 'mediaDevices',
      expected: '> 0',
      observed: 0,
      severity: 'medium',
      message: 'navigator.mediaDevices.enumerateDevices trả về mảng rỗng (dấu hiệu VPS headless không thiết bị âm thanh/hình ảnh)'
    });
  }
  let penalty = 0;
  for (const m of mismatches) {
    if (m.severity === 'critical') penalty += 40;else if (m.severity === 'high') penalty += 20;else if (m.severity === 'medium') penalty += 10;else penalty += 5;
  }
  return {
    consistent: mismatches.length === 0,
    score: Math.max(0, 100 - penalty),
    mismatches
  };
}
export { analyzeProfileCoherence };
