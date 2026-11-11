/**
 * Thu thập snapshot fingerprint thực tế đang hiển thị trong trang qua page.evaluate.
 *
 * @param {object} page Page Playwright.
 * @return {Promise<object|null>} Đối tượng snapshot hoặc null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function collectProfileCoherenceSnapshot(page) {
  if (!page || typeof page.evaluate !== 'function') return null;
  return await page.evaluate(async () => {
    let webglVendor = null;
    let webglRenderer = null;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          webglVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
          webglRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        }
      }
    } catch {}
    let timezone = null;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {}
    let clientHintsPlatform = null;
    let clientHintsMobile = null;
    try {
      if (navigator.userAgentData) {
        clientHintsPlatform = navigator.userAgentData.platform;
        clientHintsMobile = navigator.userAgentData.mobile;
      }
    } catch {}
    let notificationPermission = null;
    try {
      if (typeof Notification !== 'undefined') {
        notificationPermission = Notification.permission;
      }
    } catch {}
    let notificationQueryState = null;
    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        const status = await navigator.permissions.query({
          name: 'notifications'
        });
        notificationQueryState = status ? status.state : null;
      }
    } catch {}
    let mediaDevicesCount = null;
    try {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
        const devs = await navigator.mediaDevices.enumerateDevices();
        mediaDevicesCount = Array.isArray(devs) ? devs.length : 0;
      }
    } catch {}
    const hasChromeObject = typeof window.chrome === 'object' && window.chrome !== null && typeof window.chrome.csi === 'function';
    const pdfViewerEnabled = typeof navigator.pdfViewerEnabled === 'boolean' ? navigator.pdfViewerEnabled : null;
    const pluginsLength = navigator.plugins ? navigator.plugins.length : 0;
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      webdriver: navigator.webdriver,
      languages: Array.from(navigator.languages || []),
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
      devicePixelRatio: window.devicePixelRatio,
      screen: {
        width: window.screen ? window.screen.width : null,
        height: window.screen ? window.screen.height : null,
        availWidth: window.screen ? window.screen.availWidth : null,
        availHeight: window.screen ? window.screen.availHeight : null
      },
      webgl: {
        vendor: webglVendor,
        renderer: webglRenderer
      },
      timezone,
      clientHints: {
        platform: clientHintsPlatform,
        mobile: clientHintsMobile
      },
      hasChromeObject,
      pdfViewerEnabled,
      pluginsLength,
      notificationPermission,
      notificationQueryState,
      mediaDevicesCount
    };
  }).catch(err => ({
    error: err?.message || String(err)
  }));
}
export { collectProfileCoherenceSnapshot };
