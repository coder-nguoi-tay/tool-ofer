/**
 * Ghép danh sách command line flags khởi động trình duyệt mô phỏng chính xác
 * luồng native của Security.dll (sub_180028180).
 *
 * @param {object} options Tham số profile, proxy, tile, locale và chính sách WebRTC.
 * @return {string[]} Danh sách cờ dòng lệnh cho trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildLocalBrowserArgs({
  profilePath,
  proxyUrl = null,
  tile = null,
  locale = 'en-US',
  headless = false,
  protectWebRtc = true
}) {
  const args = ['--remote-debugging-port=0', `--user-data-dir=${profilePath}`, `--lang=${locale}`, '--restore-last-session', '--disable-blink-features=AutomationControlled', '--disable-encryption', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--donut-pie=undefined', '--disable-component-update', '--disable-background-networking', '--autoplay-policy=user-gesture-required', '--disable-features=PrintCompositorLPAC,IntensiveWakeUpThrottling', '--font-masking-mode=1', '--no-first-run', '--no-default-browser-check'];
  args.push(`--webrtc-ip-handling-policy=${protectWebRtc ? proxyUrl ? 'disable_non_proxied_udp' : 'default_public_interface_only' : 'default'}`);
  if (headless) {
    args.push('--headless=new');
    args.push('--window-size=1280,800');
  } else if (tile) {
    args.push(`--window-position=${tile.left},${tile.top}`);
    args.push(`--window-size=${tile.width},${tile.height}`);
  }
  if (proxyUrl) {
    args.push(`--proxy-server=${proxyUrl}`);
  }
  return args;
}
export { buildLocalBrowserArgs };
