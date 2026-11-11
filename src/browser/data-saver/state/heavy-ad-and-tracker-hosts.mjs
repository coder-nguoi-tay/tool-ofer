/**
 * Danh sách domain chuyên phân phối video quảng cáo, banner quảng cáo video nặng
 * và các dịch vụ quay lén thao tác màn hình (session replay) gây ngốn băng thông proxy.
 * Tuyệt đối KHÔNG chứa domain của Captcha, Cloudflare, hay tracking affiliate.
 */
const HEAVY_AD_AND_TRACKER_HOSTS = [
// Video Ad Networks & Outstream Video Players
'vidoomy.com', 'connatix.com', 'anyclip.com', 'playwire.com', 'aniview.com', 'primis.tech', 'teads.tv', 'spotxchange.com', 'spotx.tv', 'outbrain.com', 'taboola.com', 'adnxs.com', 'criteo.com', 'criteo.net', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'smartadserver.com', 'adroll.com', 'moatads.com', 'scorecardresearch.com', 'yieldmo.com', 'adcolony.com', 'inmobi.com', 'undertone.com', 'gumgum.com', 'triplelift.com', 'serving-sys.com', 'flashtalking.com',
// Google Heavy Video Ad Subdomains (chỉ chặn endpoint quảng cáo video/banner của google, không chặn recaptcha/auth)
'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net', 'pagead2.googlesyndication.com', 'adservice.google.com',
// Heavy Session Replay & Screen Recording (truyền stream thao tác màn hình về server)
'hotjar.com', 'clarity.ms', 'fullstory.com', 'mouseflow.com', 'crazyegg.com', 'smartlook.com', 'luckyorange.com'];
export { HEAVY_AD_AND_TRACKER_HOSTS };
