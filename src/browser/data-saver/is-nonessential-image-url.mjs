const nonessentialImageHosts = [
  'facebook.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adroll.com',
  'adnxs.com',
  'rubiconproject.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'amazon-adsystem.com',
  'bat.bing.com',
  'ads.twitter.com',
  'analytics.twitter.com',
  'advertising.com',
  'moatads.com',
  'scorecardresearch.com',
  'quantserve.com',
  'ads-twitter.com',
  't.co'
];

const protectedKeywords = [
  'captcha',
  'turnstile',
  'challenge',
  'recaptcha',
  'hcaptcha',
  'arkose',
  'geetest',
  'logo',
  'choice',
  'option',
  'answer',
  'survey',
  'question',
  'quiz',
  'rating',
  'star'
];

/**
 * Nhận diện hình ảnh thuộc mạng quảng cáo bên thứ 3 hoặc tracking pixel không cần thiết.
 * Luôn bảo toàn 100% ảnh Captcha, ảnh cùng domain offer, SVG, icon và ảnh câu hỏi khảo sát.
 *
 * @param {string} url URL hình ảnh đang được yêu cầu.
 * @param {string} pageUrl URL của trang web hiện tại để bảo vệ ảnh cùng domain.
 * @return {boolean} True nếu là ảnh quảng cáo/tracking rác an toàn để chặn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function isNonessentialImageUrl(url, pageUrl = '') {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:image/') || url.includes('.svg') || url.includes('favicon')) return false;

  const lowerUrl = url.toLowerCase();
  if (protectedKeywords.some(kw => lowerUrl.includes(kw))) return false;

  try {
    const resourceHost = new URL(url).hostname;
    const pageHost = pageUrl ? new URL(pageUrl).hostname : '';

    // Bảo vệ ảnh thuộc chính website/domain của offer
    if (pageHost && (resourceHost === pageHost || resourceHost.endsWith('.' + pageHost) || pageHost.endsWith('.' + resourceHost))) {
      return false;
    }

    // Chặn ảnh từ mạng quảng cáo & banner rác bên thứ 3
    if (nonessentialImageHosts.some(host => resourceHost === host || resourceHost.endsWith('.' + host))) {
      return true;
    }

    // Chặn tracking pixel rác (1x1 gif/png)
    if (/(?:\/tr|\/pixel|\/collect|\/beacon|\/1x1|\/spacer|\/blank)\.(?:gif|png|jpe?g|webp)/i.test(url) ||
        /(?:\/tr\/|\/collect\?|\/pageview\?|\/pixel\?)/i.test(url)) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
